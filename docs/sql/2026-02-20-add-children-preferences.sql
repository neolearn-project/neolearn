-- Adds signup preference fields shown in the auth modal.
-- Run in Supabase SQL Editor.

alter table if exists public.children
  add column if not exists country text,
  add column if not exists language text,
  add column if not exists subject_type text;

update public.children
set
  country = coalesce(nullif(country, ''), 'India'),
  language = coalesce(nullif(language, ''), 'English'),
  subject_type = coalesce(nullif(subject_type, ''), 'regular')
where
  country is null
  or language is null
  or subject_type is null
  or country = ''
  or language = ''
  or subject_type = '';

alter table if exists public.children
  alter column country set default 'India',
  alter column language set default 'English',
  alter column subject_type set default 'regular';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'children_subject_type_check'
  ) then
    alter table public.children
      add constraint children_subject_type_check
      check (subject_type in ('regular', 'competitive'));
  end if;
end $$;
