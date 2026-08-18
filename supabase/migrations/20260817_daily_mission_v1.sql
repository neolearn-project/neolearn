create extension if not exists pgcrypto;

create table if not exists public.daily_missions (
  id uuid primary key default gen_random_uuid(),
  student_mobile text not null,
  mission_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed')),
  board text null,
  class_number integer null,
  track text not null default 'regular',
  subject_id integer null,
  chapter_id integer null,
  topic_id integer null,
  subject_name text null,
  chapter_name text null,
  topic_name text not null default 'Continue current topic',
  weak_area text null,
  latest_score integer null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  unique (student_mobile, mission_date)
);

create table if not exists public.daily_mission_tasks (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.daily_missions(id) on delete cascade,
  task_type text not null
    check (task_type in ('learn_topic', 'topic_test', 'review_weak_area')),
  title text not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed')),
  sort_order integer not null,
  completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_id, task_type)
);

create table if not exists public.daily_mission_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid null references public.daily_missions(id) on delete cascade,
  student_mobile text not null,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.daily_missions enable row level security;
alter table public.daily_mission_tasks enable row level security;
alter table public.daily_mission_events enable row level security;

create index if not exists daily_missions_student_date_idx
  on public.daily_missions (student_mobile, mission_date desc);

create index if not exists daily_mission_tasks_mission_sort_idx
  on public.daily_mission_tasks (mission_id, sort_order);

create index if not exists daily_mission_events_student_created_idx
  on public.daily_mission_events (student_mobile, created_at desc);

comment on table public.daily_missions is
  'Per-student per-day NeoLearn study coach mission.';

comment on table public.daily_mission_tasks is
  'Three lightweight tasks attached to each daily mission.';

comment on table public.daily_mission_events is
  'Optional audit trail for mission task updates.';
