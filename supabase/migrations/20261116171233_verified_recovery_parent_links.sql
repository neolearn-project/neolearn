alter table public.student_otp_challenges drop constraint student_otp_challenges_purpose_check;
alter table public.student_otp_challenges add constraint student_otp_challenges_purpose_check check(purpose in('student_login','student_signup','student_reset','parent_reset','guardian_link','parent_login'));
create unique index if not exists parent_profile_mobile_unique on public.parent_profile(mobile);
create unique index if not exists children_parent_student_unique on public.children(parent_mobile,child_mobile);
create table public.guardian_link_consents(
 proof_id uuid primary key,
 student_user_id uuid not null,
 parent_user_id uuid not null,
 approved_at timestamptz not null default now(),
 verification_method text not null default 'sms_otp'
);
alter table public.guardian_link_consents enable row level security;
revoke all on public.guardian_link_consents from public,anon,authenticated;
grant all on public.guardian_link_consents to service_role;
create or replace function public.student_otp_reserve(p_mobile_hash text,p_ip_hash text,p_purpose text,p_binding_hash text)
returns uuid language plpgsql set search_path=public,pg_temp as $$
declare cid uuid; k text; lim integer; n integer; ts timestamptz:=clock_timestamp();
begin
if p_mobile_hash !~ '^[a-f0-9]{64}$'or p_ip_hash !~ '^[a-f0-9]{64}$'or p_binding_hash !~ '^[a-f0-9]{64}$'or p_purpose not in('student_login','student_signup','student_reset','parent_reset','guardian_link','parent_login')then raise exception 'OTP_INVALID';end if;
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


create function public.link_verified_parent(p_student_id uuid,p_parent_user_id uuid,p_parent_mobile text,p_parent_name text,p_proof_id uuid,p_mobile_hash text,p_binding_hash text,p_learning jsonb)
returns void language plpgsql set search_path=public,pg_temp as $$
declare st public.students%rowtype;proof public.student_otp_challenges%rowtype;grade integer;track text;board text;
begin
if p_parent_mobile !~ '^[6-9][0-9]{9}$'or length(p_parent_name)not between 1 and 120 then raise exception 'LINK_INVALID';end if;
if p_mobile_hash<>encode(sha256(convert_to(p_parent_mobile,'UTF8')),'hex')or p_binding_hash<>encode(sha256(convert_to('{"studentId":'||to_json(p_student_id::text)::text||',"parentName":'||to_json(p_parent_name)::text||',"permission":"student_progress"}','UTF8')),'hex')then raise exception 'LINK_PROOF_INVALID';end if;
perform pg_advisory_xact_lock(hashtextextended('guardian-link-write',0));
select * into strict st from students where user_id=p_student_id or id=p_student_id for update;
select * into proof from student_otp_challenges where id=p_proof_id for update;
if not found or proof.purpose<>'guardian_link'or proof.consumed_at is null or proof.expires_at<=clock_timestamp()or proof.mobile_hash<>p_mobile_hash or proof.binding_hash<>p_binding_hash or(proof.target_user_id is not null and proof.target_user_id<>p_parent_user_id)then raise exception 'LINK_PROOF_INVALID';end if;
if exists(select 1 from guardian_link_consents where proof_id=p_proof_id)then raise exception 'LINK_PROOF_USED';end if;
if not exists(select 1 from parent_profile where user_id=p_parent_user_id and mobile=p_parent_mobile)then raise exception 'LINK_PARENT_CHANGED';end if;
if exists(select 1 from children where child_mobile=st.phone and parent_mobile<>p_parent_mobile)then raise exception 'PARENT_LINK_CONFLICT';end if;
track:=case when p_learning->>'track'='competitive'then 'competitive'else 'regular'end;
grade:=coalesce(nullif(regexp_replace(coalesce(st.class_label,st.class,''),'[^0-9]','','g'),'')::integer,6);
if track='regular'and grade not between 6 and 12 then raise exception 'LINK_CLASS_INVALID';end if;
board:=coalesce(p_learning->>'board','CBSE');
if track='regular'and board not in('CBSE','ICSE','TBSE')then raise exception 'LINK_BOARD_INVALID';end if;
if track='competitive'and board not in('JEE','NEET','CUET','SSC','Banking','UPSC','Foundation')then raise exception 'LINK_BOARD_INVALID';end if;
-- Existing same-parent links keep their academic profile and identity intact.
insert into children(parent_mobile,child_mobile,child_name,board,class_number,country,language,subject_type)
values(p_parent_mobile,st.phone,coalesce(st.full_name,st.name,'Student'),board,case when track='regular'then grade else null end,'India',case when p_learning->>'language'in('English','Hindi','Bengali')then p_learning->>'language'else 'English'end,track)
on conflict(parent_mobile,child_mobile)do nothing;
update students set guardian_name=p_parent_name,guardian_phone=p_parent_mobile where id=st.id;
insert into guardian_link_consents(proof_id,student_user_id,parent_user_id)values(p_proof_id,p_student_id,p_parent_user_id);
end $$;
revoke all on function public.link_verified_parent(uuid,uuid,text,text,uuid,text,text,jsonb)from public,anon,authenticated;
grant execute on function public.link_verified_parent(uuid,uuid,text,text,uuid,text,text,jsonb)to service_role;
