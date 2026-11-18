create or replace function public.register_verified_student(p_user_id uuid,p_profile jsonb)
returns void language plpgsql set search_path=public,pg_temp as $$
declare v_mobile text:=p_profile->>'mobile'; v_username text:=p_profile->>'username';
begin
if v_mobile !~ '^[6-9][0-9]{9}$'or v_username !~ '^[a-z0-9._-]{4,40}$'then raise exception 'SIGNUP_INVALID';end if;
perform pg_advisory_xact_lock(hashtextextended('student-registration',0));
if exists(select 1 from students where phone=v_mobile or students.username=v_username)
or exists(select 1 from student_profile where student_profile.mobile=v_mobile)then raise exception 'SIGNUP_EXISTS';end if;
insert into students(id,user_id,username,phone,name,full_name,class_label,class,source,phone_verified,phone_verified_at,guardian_name,guardian_phone)
values(p_user_id,p_user_id,v_username,v_mobile,p_profile->>'name',p_profile->>'name','Class '||coalesce(nullif(p_profile->>'classId',''),'6'),'Class '||coalesce(nullif(p_profile->>'classId',''),'6'),'student_signup',true,now(),nullif(p_profile->>'parentName',''),nullif(p_profile->>'parentMobile',''));
insert into student_profile(student_id,mobile,name,preferred_language)
values(p_user_id,v_mobile,p_profile->>'name',case p_profile->>'language'when 'Hindi'then 'hi'when 'Bengali'then 'bn'else 'en'end);
end $$;

