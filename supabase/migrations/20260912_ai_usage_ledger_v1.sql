create extension if not exists pgcrypto;

create table if not exists public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  feature text not null,
  provider text not null default 'openai',
  provider_call text not null,
  model text not null,
  openai_response_id text null,
  request_id text not null,
  idempotency_key text not null,
  retry_attempt integer not null default 0,
  input_tokens integer null,
  cached_input_tokens integer null,
  output_tokens integer null,
  reasoning_tokens integer null,
  total_tokens integer null,
  audio_input_tokens integer null,
  cached_audio_input_tokens integer null,
  audio_output_tokens integer null,
  tts_characters integer null,
  cost_nano_usd numeric(30,0) null,
  pricing_status text not null default 'unknown'
    check (pricing_status in ('priced', 'unpriced', 'unknown')),
  pricing_reason text null,
  price_version text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'success', 'failure')),
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint ai_usage_ledger_no_raw_mobile
    check (student_id !~ '^[0-9]{10,15}$')
);

create unique index if not exists ai_usage_ledger_idempotency_key_uidx
  on public.ai_usage_ledger (idempotency_key);

create index if not exists ai_usage_ledger_student_created_idx
  on public.ai_usage_ledger (student_id, created_at desc);

create index if not exists ai_usage_ledger_feature_created_idx
  on public.ai_usage_ledger (feature, created_at desc);

create index if not exists ai_usage_ledger_request_idx
  on public.ai_usage_ledger (request_id);

create table if not exists public.ai_usage_requests (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  feature text not null,
  request_id text not null,
  request_hash text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'success', 'failure')),
  attempt_count integer not null default 0,
  locked_until timestamptz not null default now(),
  response_status integer null,
  response_headers jsonb not null default '{}'::jsonb,
  response_body_base64 text null,
  response_body_sha256 text null,
  replay_expires_at timestamptz null,
  last_error text null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_usage_requests_no_raw_mobile
    check (student_id !~ '^[0-9]{10,15}$'),
  unique (student_id, feature, request_id)
);

create index if not exists ai_usage_requests_student_created_idx
  on public.ai_usage_requests (student_id, created_at desc);

create index if not exists ai_usage_requests_status_lock_idx
  on public.ai_usage_requests (status, locked_until);

create index if not exists ai_usage_requests_replay_expiry_idx
  on public.ai_usage_requests (replay_expires_at)
  where response_body_base64 is not null;

create or replace function public.cleanup_expired_ai_usage_replays()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned integer;
begin
  update public.ai_usage_requests
  set
    response_headers = '{}'::jsonb,
    response_body_base64 = null,
    response_body_sha256 = null,
    updated_at = now()
  where replay_expires_at is not null
    and replay_expires_at < now()
    and response_body_base64 is not null;

  get diagnostics cleaned = row_count;
  return cleaned;
end;
$$;

revoke all on function public.cleanup_expired_ai_usage_replays() from public;
revoke all on function public.cleanup_expired_ai_usage_replays() from anon;
revoke all on function public.cleanup_expired_ai_usage_replays() from authenticated;

alter table public.ai_usage_ledger enable row level security;
alter table public.ai_usage_requests enable row level security;

revoke all on table public.ai_usage_ledger from anon;
revoke all on table public.ai_usage_ledger from authenticated;
revoke all on table public.ai_usage_requests from anon;
revoke all on table public.ai_usage_requests from authenticated;

comment on table public.ai_usage_ledger is
  'Server-only NeoLearn AI Usage Ledger V1. Access through service-role server code only; never stores prompts, transcripts, secrets, or raw mobile numbers.';

comment on table public.ai_usage_requests is
  'Server-only route idempotency and response replay cache for student-facing AI routes. Never store secrets, prompts, transcripts, or raw mobile numbers.';
