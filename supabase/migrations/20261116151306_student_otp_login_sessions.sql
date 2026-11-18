create table public.student_otp_challenges (
 id uuid primary key default gen_random_uuid(),
 mobile_hash text not null,
 purpose text not null check(purpose in ('student_login','student_signup')),
 binding_hash text not null,
 target_user_id uuid,
 provider_sid text,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',
 attempts integer not null default 0,
 lease uuid,
 lease_until timestamptz,
 consumed_at timestamptz,
 ready boolean not null default false
);
create index student_otp_challenges_mobile_created on public.student_otp_challenges(mobile_hash,created_at desc);
create table public.student_otp_limits (
 key text primary key,
 window_start timestamptz not null,
 count integer not null
);
alter table public.student_otp_challenges enable row level security;
alter table public.student_otp_limits enable row level security;
revoke all on public.student_otp_challenges,public.student_otp_limits from public,anon,authenticated;
grant all on public.student_otp_challenges,public.student_otp_limits to service_role;

create function public.student_otp_reserve(p_mobile_hash text,p_ip_hash text,p_purpose text,p_binding_hash text)
returns uuid language plpgsql set search_path=public,pg_temp as $$
declare cid uuid; k text; lim integer; n integer; ts timestamptz:=clock_timestamp();
begin
if p_mobile_hash !~ '^[a-f0-9]{64}$'or p_ip_hash !~ '^[a-f0-9]{64}$'or p_binding_hash !~ '^[a-f0-9]{64}$'or p_purpose not in('student_login','student_signup')then raise exception 'OTP_INVALID';end if;
perform pg_advisory_xact_lock(hashtextextended('student-otp-send-budget',0));
if exists(select 1 from student_otp_challenges where mobile_hash=p_mobile_hash and created_at>ts-interval '60 seconds')then raise exception 'OTP_RATE_LIMIT';end if;
-- Shared budget includes login and signup, including unknown accounts and failed sends.
for k,lim in select * from(values('phone:'||p_mobile_hash,5),('ip:'||p_ip_hash,20),('global',100),('global-day',300))v(k,l)loop
insert into student_otp_limits(key,window_start,count)values(k,ts,1)
on conflict(key)do update set count=case when student_otp_limits.window_start<ts-case when k='global-day'then interval '1 day'else interval '1 hour'end then 1 else student_otp_limits.count+1 end,
 window_start=case when student_otp_limits.window_start<ts-case when k='global-day'then interval '1 day'else interval '1 hour'end then ts else student_otp_limits.window_start end
returning count into n;
if n>lim then raise exception 'OTP_RATE_LIMIT';end if;
end loop;
-- A new send supersedes the old request for this phone across these two purposes.
update student_otp_challenges set consumed_at=ts where mobile_hash=p_mobile_hash and consumed_at is null;
insert into student_otp_challenges(mobile_hash,purpose,binding_hash)values(p_mobile_hash,p_purpose,p_binding_hash)returning id into cid;
-- Bounded retention; these rows contain no OTP or plaintext phone/IP.
delete from student_otp_challenges where expires_at<ts-interval '1 day';
delete from student_otp_limits where window_start<ts-interval '2 days';
return cid;
end $$;

create function public.student_otp_attach(p_id uuid,p_sid text,p_target uuid)
returns void language plpgsql set search_path=public,pg_temp as $$
begin
if p_sid is not null and p_sid !~ '^VE[a-fA-F0-9]{32}$'then raise exception 'OTP_PROVIDER';end if;
update student_otp_challenges set provider_sid=p_sid,target_user_id=p_target,ready=true
where id=p_id and not ready and consumed_at is null and expires_at>now();
if not found then raise exception 'OTP_STALE';end if;
end $$;

create function public.student_otp_claim(p_id uuid,p_mobile_hash text,p_purpose text,p_binding_hash text,p_lease uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare c student_otp_challenges%rowtype;
begin
select * into c from student_otp_challenges where id=p_id for update;
if not found or not c.ready or c.mobile_hash<>p_mobile_hash or c.purpose<>p_purpose or c.binding_hash<>p_binding_hash or c.consumed_at is not null or c.expires_at<=clock_timestamp()or c.attempts>=5 then raise exception 'OTP_INVALID';end if;
if c.lease_until>clock_timestamp()then raise exception 'OTP_BUSY';end if;
update student_otp_challenges set attempts=attempts+1,lease=p_lease,lease_until=clock_timestamp()+interval '45 seconds'where id=p_id;
return jsonb_build_object('id',c.id,'provider_sid',c.provider_sid,'target_user_id',c.target_user_id,'lease',p_lease);
end $$;

create function public.student_otp_finish(p_id uuid,p_lease uuid,p_approved boolean)
returns void language plpgsql set search_path=public,pg_temp as $$
begin
update student_otp_challenges set consumed_at=case when p_approved then clock_timestamp()else null end,lease=null,lease_until=null
where id=p_id and lease=p_lease and lease_until>clock_timestamp()and consumed_at is null and expires_at>clock_timestamp();
if not found then raise exception 'OTP_STALE';end if;
end $$;

create function public.register_verified_student(p_user_id uuid,p_profile jsonb)
returns void language plpgsql set search_path=public,pg_temp as $$
declare mobile text:=p_profile->>'mobile'; username text:=p_profile->>'username';
begin
if mobile !~ '^[6-9][0-9]{9}$'or username !~ '^[a-z0-9._-]{4,40}$'then raise exception 'SIGNUP_INVALID';end if;
perform pg_advisory_xact_lock(hashtextextended('student-registration',0));
if exists(select 1 from students where phone=mobile or students.username=register_verified_student.username)
or exists(select 1 from student_profile where student_profile.mobile=register_verified_student.mobile)then raise exception 'SIGNUP_EXISTS';end if;
insert into students(id,user_id,username,phone,name,full_name,class_label,class,source,phone_verified,phone_verified_at,guardian_name,guardian_phone)
values(p_user_id,p_user_id,username,mobile,p_profile->>'name',p_profile->>'name','Class '||coalesce(nullif(p_profile->>'classId',''),'6'),'Class '||coalesce(nullif(p_profile->>'classId',''),'6'),'student_signup',true,now(),nullif(p_profile->>'parentName',''),nullif(p_profile->>'parentMobile',''));
insert into student_profile(student_id,mobile,name,preferred_language)
values(p_user_id,mobile,p_profile->>'name',case p_profile->>'language'when 'Hindi'then 'hi'when 'Bengali'then 'bn'else 'en'end);
end $$;

revoke all on function public.student_otp_reserve(text,text,text,text),public.student_otp_attach(uuid,text,uuid),public.student_otp_claim(uuid,text,text,text,uuid),public.student_otp_finish(uuid,uuid,boolean),public.register_verified_student(uuid,jsonb)from public,anon,authenticated;
grant execute on function public.student_otp_reserve(text,text,text,text),public.student_otp_attach(uuid,text,uuid),public.student_otp_claim(uuid,text,text,text,uuid),public.student_otp_finish(uuid,uuid,boolean),public.register_verified_student(uuid,jsonb)to service_role;
