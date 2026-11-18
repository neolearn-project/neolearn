create table public.teacher_otp_challenges (
 id uuid primary key default gen_random_uuid(),
 mobile_hash text not null,
 purpose text not null check(purpose in ('teacher_login')),
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
create index teacher_otp_challenges_mobile_created on public.teacher_otp_challenges(mobile_hash,created_at desc);
create table public.teacher_otp_limits (
 key text primary key,
 window_start timestamptz not null,
 count integer not null
);
alter table public.teacher_otp_challenges enable row level security;
alter table public.teacher_otp_limits enable row level security;
revoke all on public.teacher_otp_challenges,public.teacher_otp_limits from public,anon,authenticated;
grant all on public.teacher_otp_challenges,public.teacher_otp_limits to service_role;

create function public.teacher_otp_reserve(p_mobile_hash text,p_ip_hash text,p_purpose text,p_binding_hash text)
returns uuid language plpgsql set search_path=public,pg_temp as $$
declare cid uuid; k text; lim integer; n integer; ts timestamptz:=clock_timestamp();
begin
if p_mobile_hash !~ '^[a-f0-9]{64}$'or p_ip_hash !~ '^[a-f0-9]{64}$'or p_binding_hash !~ '^[a-f0-9]{64}$'or p_purpose not in('teacher_login')then raise exception 'OTP_INVALID';end if;
perform pg_advisory_xact_lock(hashtextextended('teacher-otp-send-budget',0));
if exists(select 1 from teacher_otp_challenges where mobile_hash=p_mobile_hash and created_at>ts-interval '60 seconds')then raise exception 'OTP_RATE_LIMIT';end if;
-- Shared budget includes login and signup, including unknown accounts and failed sends.
for k,lim in select * from(values('phone:'||p_mobile_hash,5),('ip:'||p_ip_hash,20),('global',100),('global-day',300))v(k,l)loop
insert into teacher_otp_limits(key,window_start,count)values(k,ts,1)
on conflict(key)do update set count=case when teacher_otp_limits.window_start<ts-case when k='global-day'then interval '1 day'else interval '1 hour'end then 1 else teacher_otp_limits.count+1 end,
 window_start=case when teacher_otp_limits.window_start<ts-case when k='global-day'then interval '1 day'else interval '1 hour'end then ts else teacher_otp_limits.window_start end
returning count into n;
if n>lim then raise exception 'OTP_RATE_LIMIT';end if;
end loop;
-- A new send supersedes the old request for this phone across these two purposes.
update teacher_otp_challenges set consumed_at=ts where mobile_hash=p_mobile_hash and consumed_at is null;
insert into teacher_otp_challenges(mobile_hash,purpose,binding_hash)values(p_mobile_hash,p_purpose,p_binding_hash)returning id into cid;
-- Bounded retention; these rows contain no OTP or plaintext phone/IP.
delete from teacher_otp_challenges where expires_at<ts-interval '1 day';
delete from teacher_otp_limits where window_start<ts-interval '2 days';
return cid;
end $$;

create function public.teacher_otp_attach(p_id uuid,p_sid text,p_target uuid)
returns void language plpgsql set search_path=public,pg_temp as $$
begin
if p_sid is not null and p_sid !~ '^VE[a-fA-F0-9]{32}$'then raise exception 'OTP_PROVIDER';end if;
update teacher_otp_challenges set provider_sid=p_sid,target_user_id=p_target,ready=true
where id=p_id and not ready and consumed_at is null and expires_at>now();
if not found then raise exception 'OTP_STALE';end if;
end $$;

create function public.teacher_otp_claim(p_id uuid,p_mobile_hash text,p_purpose text,p_binding_hash text,p_lease uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare c teacher_otp_challenges%rowtype;
begin
select * into c from teacher_otp_challenges where id=p_id for update;
if not found or not c.ready or c.mobile_hash<>p_mobile_hash or c.purpose<>p_purpose or c.binding_hash<>p_binding_hash or c.consumed_at is not null or c.expires_at<=clock_timestamp()or c.attempts>=5 then raise exception 'OTP_INVALID';end if;
if c.lease_until>clock_timestamp()then raise exception 'OTP_BUSY';end if;
update teacher_otp_challenges set attempts=attempts+1,lease=p_lease,lease_until=clock_timestamp()+interval '45 seconds'where id=p_id;
return jsonb_build_object('id',c.id,'provider_sid',c.provider_sid,'target_user_id',c.target_user_id,'lease',p_lease);
end $$;

create function public.teacher_otp_finish(p_id uuid,p_lease uuid,p_approved boolean)
returns void language plpgsql set search_path=public,pg_temp as $$
begin
update teacher_otp_challenges set consumed_at=case when p_approved then clock_timestamp()else null end,lease=null,lease_until=null
where id=p_id and lease=p_lease and lease_until>clock_timestamp()and consumed_at is null and expires_at>clock_timestamp();
if not found then raise exception 'OTP_STALE';end if;
end $$;


revoke all on function public.teacher_otp_reserve(text,text,text,text),public.teacher_otp_attach(uuid,text,uuid),public.teacher_otp_claim(uuid,text,text,text,uuid),public.teacher_otp_finish(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.teacher_otp_reserve(text,text,text,text),public.teacher_otp_attach(uuid,text,uuid),public.teacher_otp_claim(uuid,text,text,text,uuid),public.teacher_otp_finish(uuid,uuid,boolean) to service_role;
create table public.teacher_portal_profiles (
 id uuid primary key default gen_random_uuid(), mobile text not null unique check(mobile ~ '^[6-9][0-9]{9}$'),
 profile jsonb not null default '{}'::jsonb, status text not null default 'draft' check(status in ('draft','pending','approved','changes_requested','suspended')),
 review_reason text not null default '', version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index teacher_portal_profiles_status on public.teacher_portal_profiles(status,updated_at desc);
create table public.teacher_portal_sessions (
 token_hash text primary key, teacher_id uuid not null references public.teacher_portal_profiles(id), expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index teacher_portal_sessions_teacher on public.teacher_portal_sessions(teacher_id);
create table public.teacher_portal_media (
 id uuid primary key, teacher_id uuid not null references public.teacher_portal_profiles(id), kind text not null check(kind in ('photo','certificate','demo')),
 path text not null unique, mime text not null, bytes bigint not null check(bytes > 0 and bytes <= 52428800),complete boolean not null default false,created_at timestamptz not null default now()
);
create index teacher_portal_media_teacher on public.teacher_portal_media(teacher_id,created_at desc);
create table public.teacher_portal_reviews (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.teacher_portal_profiles(id), version integer not null, action text not null, reason text not null,created_at timestamptz not null default now()
);
create index teacher_portal_reviews_teacher on public.teacher_portal_reviews(teacher_id);
alter table public.teacher_portal_profiles enable row level security;
alter table public.teacher_portal_sessions enable row level security;
alter table public.teacher_portal_media enable row level security;
alter table public.teacher_portal_reviews enable row level security;
revoke all on public.teacher_portal_profiles,public.teacher_portal_sessions,public.teacher_portal_media,public.teacher_portal_reviews from public,anon,authenticated;
grant all on public.teacher_portal_profiles,public.teacher_portal_sessions,public.teacher_portal_media,public.teacher_portal_reviews to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('teacher-portal','teacher-portal',false,52428800,array['image/jpeg','image/png','application/pdf','video/mp4','video/webm']);
create function public.teacher_portal_save(p_id uuid,p_version integer,p_profile jsonb,p_submit boolean) returns void language plpgsql set search_path=public,pg_temp as $$
declare p teacher_portal_profiles%rowtype;
begin
 select * into p from teacher_portal_profiles where id=p_id for update;
 if not found or p.version<>p_version or p.status='suspended' then raise exception 'PROFILE_CONFLICT';end if;
 if p_submit and exists(select 1 from (values('photo'),('certificate'),('demo')) k(kind) where not exists(select 1 from teacher_portal_media m where m.teacher_id=p_id and m.kind=k.kind and m.complete))then raise exception 'MEDIA_REQUIRED';end if;
 update teacher_portal_profiles set profile=p_profile,status=case when p_submit then 'pending' else 'draft' end,review_reason='',version=version+1,updated_at=now() where id=p_id;
end $$;
create function public.teacher_portal_reserve_media(p_id uuid,p_media uuid,p_kind text,p_mime text,p_bytes bigint,p_path text) returns void language plpgsql set search_path=public,pg_temp as $$
begin
 perform 1 from teacher_portal_profiles where id=p_id and status<>'suspended' for update;
 if not found then raise exception 'PROFILE_CONFLICT';end if;
 if (select count(*) from teacher_portal_media where teacher_id=p_id and kind=p_kind and created_at>now()-interval '1 day')>=3 then raise exception 'UPLOAD_RATE_LIMIT';end if;
 insert into teacher_portal_media(id,teacher_id,kind,mime,bytes,path)values(p_media,p_id,p_kind,p_mime,p_bytes,p_path);
end $$;
create function public.teacher_portal_complete_media(p_id uuid,p_media uuid) returns void language plpgsql set search_path=public,pg_temp as $$
begin
 perform 1 from teacher_portal_profiles where id=p_id and status<>'suspended' for update;
 if not found then raise exception 'PROFILE_CONFLICT';end if;
 if exists(select 1 from teacher_portal_media where id=p_media and teacher_id=p_id and complete)then return;end if;
 update teacher_portal_media set complete=true where id=p_media and teacher_id=p_id;
 if not found then raise exception 'MEDIA_INVALID';end if;
 update teacher_portal_profiles set status='draft',version=version+1,updated_at=now(),review_reason='' where id=p_id;
end $$;
create function public.teacher_portal_review(p_id uuid,p_version integer,p_action text,p_reason text) returns void language plpgsql set search_path=public,pg_temp as $$
declare p teacher_portal_profiles%rowtype; next_status text;
begin
 select * into p from teacher_portal_profiles where id=p_id for update;
 if not found or p.version<>p_version then raise exception 'PROFILE_CONFLICT';end if;
 if p_action='approve' and p.status='pending' then next_status:='approved';
 elsif p_action='changes_requested' and p.status='pending' then next_status:='changes_requested';
 elsif p_action='suspend' and p.status='approved' then next_status:='suspended';
 else raise exception 'PROFILE_CONFLICT';end if;
 if length(p_reason)>500 or (p_action<>'approve' and length(trim(p_reason))=0)then raise exception 'REASON_REQUIRED';end if;
 insert into teacher_portal_reviews(teacher_id,version,action,reason)values(p_id,p_version,p_action,p_reason);
 update teacher_portal_profiles set status=next_status,review_reason=p_reason,version=version+1,updated_at=now() where id=p_id;
end $$;
revoke all on function public.teacher_portal_save(uuid,integer,jsonb,boolean),public.teacher_portal_reserve_media(uuid,uuid,text,text,bigint,text),public.teacher_portal_complete_media(uuid,uuid),public.teacher_portal_review(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.teacher_portal_save(uuid,integer,jsonb,boolean),public.teacher_portal_reserve_media(uuid,uuid,text,text,bigint,text),public.teacher_portal_complete_media(uuid,uuid),public.teacher_portal_review(uuid,integer,text,text) to service_role;
