-- PR-1: Add track support + seed plans
-- Run in Supabase SQL editor.

-- 1) Signup/profile tables
alter table if exists public.children
  add column if not exists track text;

alter table if exists public.children
  alter column track set default 'regular';

update public.children
set track = coalesce(nullif(track, ''), coalesce(nullif(subject_type, ''), 'regular'))
where track is null or track = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'children_track_check'
  ) then
    alter table public.children
      add constraint children_track_check
      check (track in ('regular', 'competitive'));
  end if;
end $$;

-- Optional additional profile stores (if present in your project)
alter table if exists public.profiles
  add column if not exists track text;
alter table if exists public.profiles
  alter column track set default 'regular';
update public.profiles
set track = coalesce(nullif(track, ''), 'regular')
where track is null or track = '';

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='profiles'
  ) and not exists (
    select 1 from pg_constraint where conname = 'profiles_track_check'
  ) then
    alter table public.profiles
      add constraint profiles_track_check
      check (track in ('regular', 'competitive'));
  end if;
end $$;

alter table if exists public.students
  add column if not exists track text;
alter table if exists public.students
  alter column track set default 'regular';
update public.students
set track = coalesce(nullif(track, ''), 'regular')
where track is null or track = '';

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='students'
  ) and not exists (
    select 1 from pg_constraint where conname = 'students_track_check'
  ) then
    alter table public.students
      add constraint students_track_check
      check (track in ('regular', 'competitive'));
  end if;
end $$;

-- 2) Syllabus source table
alter table if exists public.subjects
  add column if not exists track text;

alter table if exists public.subjects
  alter column track set default 'regular';

update public.subjects
set track = coalesce(nullif(track, ''), 'regular')
where track is null or track = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subjects_track_check'
  ) then
    alter table public.subjects
      add constraint subjects_track_check
      check (track in ('regular', 'competitive'));
  end if;
end $$;

create index if not exists idx_subjects_track on public.subjects(track);

-- 3) Plans table (track + seed)
alter table if exists public.plans
  add column if not exists track text;

alter table if exists public.plans
  alter column track set default 'regular';

update public.plans
set track = coalesce(nullif(track, ''), 'regular')
where track is null or track = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'plans_track_check'
  ) then
    alter table public.plans
      add constraint plans_track_check
      check (track in ('regular', 'competitive'));
  end if;
end $$;

-- Assumes plans has: code, name, amount, validity_days, track
insert into public.plans (code, name, amount, validity_days, track)
values
  ('REGULAR_MONTHLY', 'Regular Monthly', 399, 30, 'regular'),
  ('REGULAR_QUARTERLY', 'Regular Quarterly', 1099, 90, 'regular'),
  ('COMPETITIVE_MONTHLY', 'Competitive Monthly', 999, 30, 'competitive')
on conflict (code)
do update set
  name = excluded.name,
  amount = excluded.amount,
  validity_days = excluded.validity_days,
  track = excluded.track;
