create extension if not exists pgcrypto;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_type text not null,
  mobile text not null,
  email text null,
  name text null,
  reason text null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;

create index if not exists account_deletion_requests_status_created_at_idx
  on public.account_deletion_requests (status, created_at desc);

comment on table public.account_deletion_requests is
  'User-submitted account deletion requests awaiting admin review.';
