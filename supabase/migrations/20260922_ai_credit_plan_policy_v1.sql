begin;

do $$
begin
  if to_regclass('public.ai_credit_config') is null
     or to_regclass('public.ai_credit_transactions') is null then
    raise exception 'PRECHECK: AI credit shadow persistence is required';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'PRECHECK: required Supabase roles are missing';
  end if;
  if not pg_catalog.pg_has_role(current_user, 'service_role', 'MEMBER')
     and not (select rolbypassrls from pg_roles where rolname = current_user) then
    raise exception 'PRECHECK: migration owner must bypass forced RLS';
  end if;
  if to_regclass('public.ai_credit_plan_policies') is not null
     or to_regclass('public.ai_credit_entitlement_periods') is not null
     or to_regclass('public.ai_credit_grant_tranches') is not null then
    raise exception 'PRECHECK: existing Stage 2 object requires explicit compatibility review';
  end if;
end
$$;

create table public.ai_credit_plan_policies (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  policy_version text not null,
  plan_code text not null,
  entitlement_type text not null check (entitlement_type in ('trial', 'paid')),
  total_credits numeric(30,0) not null,
  rolling_5h_credits numeric(30,0) not null,
  daily_credits numeric(30,0) not null,
  tranche_count integer not null,
  tranche_credits numeric(30,0) not null,
  tranche_interval_days integer not null,
  credit_paise numeric(30,0) not null,
  fx_paise_per_usd numeric(30,0) not null,
  fx_safety_bps integer not null,
  markup_bps integer not null,
  reservation_ttl_seconds integer not null,
  action_minimum_credits jsonb not null,
  non_billable_features jsonb not null,
  is_active boolean not null default false,
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  unique (policy_version, plan_code),
  check (pg_catalog.btrim(policy_version) <> '' and pg_catalog.btrim(plan_code) <> ''),
  check (total_credits > 0 and rolling_5h_credits > 0 and daily_credits > 0),
  check (rolling_5h_credits <= daily_credits and daily_credits <= total_credits),
  check (tranche_count > 0 and tranche_credits > 0 and tranche_interval_days >= 0),
  check (tranche_credits * tranche_count = total_credits),
  check (credit_paise = 1 and fx_paise_per_usd = 9500 and fx_safety_bps = 11000
    and markup_bps = 25000 and reservation_ttl_seconds = 900),
  check (pg_catalog.jsonb_typeof(action_minimum_credits) = 'object'),
  check (pg_catalog.jsonb_typeof(non_billable_features) = 'array'),
  check (effective_until is null or effective_until > effective_from)
);

create unique index ai_credit_plan_policies_one_active_per_plan_uidx
  on public.ai_credit_plan_policies (plan_code) where is_active;

create table public.ai_credit_entitlement_periods (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  student_id text not null,
  entitlement_identity text not null unique,
  entitlement_type text not null check (entitlement_type in ('trial', 'paid', 'upgrade')),
  plan_code text not null,
  source_subscription_id text,
  source_period_start timestamptz not null,
  source_period_end timestamptz not null,
  policy_id uuid not null references public.ai_credit_plan_policies(id) on delete restrict,
  source_entitlement_period_id uuid references public.ai_credit_entitlement_periods(id) on delete restrict,
  policy_snapshot jsonb not null,
  total_credits numeric(30,0) not null,
  rolling_5h_credits numeric(30,0) not null,
  daily_credits numeric(30,0) not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  check (pg_catalog.btrim(student_id) <> '' and student_id !~ '^[0-9]{10,15}$'),
  check (pg_catalog.btrim(entitlement_identity) <> '' and pg_catalog.btrim(plan_code) <> ''),
  check (source_period_end > source_period_start and expires_at = source_period_end),
  check ((entitlement_type = 'upgrade') = (source_entitlement_period_id is not null)),
  check (total_credits >= 0 and rolling_5h_credits > 0 and daily_credits > 0),
  check (pg_catalog.jsonb_typeof(policy_snapshot) = 'object')
);

create unique index ai_credit_entitlement_trial_once_uidx
  on public.ai_credit_entitlement_periods (student_id) where entitlement_type = 'trial';
create index ai_credit_entitlement_student_period_idx
  on public.ai_credit_entitlement_periods (student_id, source_period_start desc);

create table public.ai_credit_grant_tranches (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  entitlement_period_id uuid not null references public.ai_credit_entitlement_periods(id) on delete restrict,
  grant_identity text not null unique,
  tranche_index integer not null,
  credit_amount numeric(30,0) not null,
  available_at timestamptz not null,
  expires_at timestamptz not null,
  grant_kind text not null check (grant_kind in ('trial', 'term', 'upgrade')),
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  unique (entitlement_period_id, tranche_index),
  check (pg_catalog.btrim(grant_identity) <> '' and tranche_index >= 0 and credit_amount > 0),
  check (expires_at > available_at)
);

create index ai_credit_grant_tranches_available_idx
  on public.ai_credit_grant_tranches (entitlement_period_id, available_at, expires_at);

create function public.prevent_ai_credit_stage2_snapshot_mutation()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$ begin raise exception 'AI credit Stage 2 snapshots are immutable'; end $$;

create trigger ai_credit_plan_policies_immutable
before update or delete on public.ai_credit_plan_policies
for each row execute function public.prevent_ai_credit_stage2_snapshot_mutation();
create trigger ai_credit_entitlement_periods_immutable
before update or delete on public.ai_credit_entitlement_periods
for each row execute function public.prevent_ai_credit_stage2_snapshot_mutation();
create trigger ai_credit_grant_tranches_immutable
before update or delete on public.ai_credit_grant_tranches
for each row execute function public.prevent_ai_credit_stage2_snapshot_mutation();

create function public.create_ai_credit_entitlement_shadow(
  p_student_id text, p_policy_id uuid, p_entitlement_identity text,
  p_period_start timestamptz, p_period_end timestamptz,
  p_source_subscription_id text default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  policy_row public.ai_credit_plan_policies%rowtype;
  period_row public.ai_credit_entitlement_periods%rowtype;
  grant_row public.ai_credit_grant_tranches%rowtype;
  index_value integer;
  available_value timestamptz;
  snapshot_value jsonb;
  expected_grant_kind text;
begin
  if pg_catalog.btrim(coalesce(p_student_id, '')) = '' or p_student_id ~ '^[0-9]{10,15}$'
     or pg_catalog.btrim(coalesce(p_entitlement_identity, '')) = ''
     or p_period_end <= p_period_start then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_ENTITLEMENT_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_student_id, 220922));
  select * into policy_row from public.ai_credit_plan_policies where id = p_policy_id for share;
  if not found then raise exception using errcode = 'P0002', message = 'AI_CREDIT_POLICY_NOT_FOUND'; end if;
  if policy_row.is_active is not true then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_POLICY_INACTIVE';
  end if;
  if policy_row.plan_code = 'REGULAR_QUARTERLY'
     and (policy_row.total_credits <> 36000 or policy_row.tranche_count <> 3
       or policy_row.tranche_credits <> 12000 or policy_row.tranche_interval_days <> 30
       or p_period_end <> p_period_start + pg_catalog.make_interval(days => 90)) then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_QUARTERLY_PERIOD_INVALID';
  end if;
  snapshot_value := pg_catalog.to_jsonb(policy_row) - 'id' - 'created_at';
  insert into public.ai_credit_entitlement_periods (
    student_id, entitlement_identity, entitlement_type, plan_code, source_subscription_id,
    source_period_start, source_period_end, policy_id, policy_snapshot,
    total_credits, rolling_5h_credits, daily_credits, expires_at
  ) values (
    p_student_id, p_entitlement_identity, policy_row.entitlement_type, policy_row.plan_code,
    p_source_subscription_id, p_period_start, p_period_end, policy_row.id,
    snapshot_value, policy_row.total_credits,
    policy_row.rolling_5h_credits, policy_row.daily_credits, p_period_end
  ) on conflict (entitlement_identity) do nothing returning * into period_row;
  if not found then
    select * into strict period_row from public.ai_credit_entitlement_periods
      where entitlement_identity = p_entitlement_identity;
    if period_row.student_id is distinct from p_student_id
       or period_row.entitlement_type is distinct from policy_row.entitlement_type
       or period_row.plan_code is distinct from policy_row.plan_code
       or period_row.source_subscription_id is distinct from p_source_subscription_id
       or period_row.policy_id is distinct from p_policy_id
       or period_row.source_period_start is distinct from p_period_start
       or period_row.source_period_end is distinct from p_period_end
       or period_row.policy_snapshot is distinct from snapshot_value
       or period_row.total_credits is distinct from policy_row.total_credits
       or period_row.rolling_5h_credits is distinct from policy_row.rolling_5h_credits
       or period_row.daily_credits is distinct from policy_row.daily_credits
       or period_row.expires_at is distinct from p_period_end then
      raise exception using errcode = 'P0001', message = 'AI_CREDIT_ENTITLEMENT_IDEMPOTENCY_CONFLICT';
    end if;
  end if;
  for index_value in 0..policy_row.tranche_count - 1 loop
    available_value := p_period_start + pg_catalog.make_interval(days => index_value * policy_row.tranche_interval_days);
    if available_value < p_period_end then
      expected_grant_kind := case when policy_row.entitlement_type = 'trial' then 'trial' else 'term' end;
      insert into public.ai_credit_grant_tranches (
        entitlement_period_id, grant_identity, tranche_index, credit_amount,
        available_at, expires_at, grant_kind
      ) values (
        period_row.id, p_entitlement_identity || ':tranche:' || index_value::text,
        index_value, policy_row.tranche_credits, available_value, p_period_end,
        expected_grant_kind
      ) on conflict (grant_identity) do nothing;
      select * into strict grant_row from public.ai_credit_grant_tranches
        where grant_identity = p_entitlement_identity || ':tranche:' || index_value::text;
      if grant_row.entitlement_period_id is distinct from period_row.id
         or grant_row.tranche_index is distinct from index_value
         or grant_row.credit_amount is distinct from policy_row.tranche_credits
         or grant_row.available_at is distinct from available_value
         or grant_row.expires_at is distinct from p_period_end
         or grant_row.grant_kind is distinct from expected_grant_kind then
        raise exception using errcode = 'P0001', message = 'AI_CREDIT_GRANT_IDEMPOTENCY_CONFLICT';
      end if;
    end if;
  end loop;
  return pg_catalog.jsonb_build_object('ok', true, 'entitlement_period_id', period_row.id,
    'plan_code', period_row.plan_code, 'expires_at', period_row.expires_at);
end
$$;

create function public.create_ai_credit_upgrade_shadow(
  p_student_id text, p_old_entitlement_id uuid, p_new_policy_id uuid,
  p_upgrade_identity text, p_upgrade_at timestamptz
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  old_row public.ai_credit_entitlement_periods%rowtype;
  policy_row public.ai_credit_plan_policies%rowtype;
  upgrade_row public.ai_credit_entitlement_periods%rowtype;
  grant_row public.ai_credit_grant_tranches%rowtype;
  snapshot_value jsonb;
  grant_identity_value text;
  remaining_seconds numeric;
  term_seconds numeric;
  difference numeric(30,0);
begin
  if pg_catalog.btrim(coalesce(p_student_id, '')) = ''
     or pg_catalog.btrim(coalesce(p_upgrade_identity, '')) = ''
     or p_upgrade_at is null then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_UPGRADE_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_student_id, 220922));
  select * into old_row from public.ai_credit_entitlement_periods where id = p_old_entitlement_id for share;
  if not found or old_row.student_id is distinct from p_student_id then
    raise exception using errcode = 'P0002', message = 'AI_CREDIT_OLD_ENTITLEMENT_NOT_FOUND';
  end if;
  select * into policy_row from public.ai_credit_plan_policies where id = p_new_policy_id for share;
  if not found then raise exception using errcode = 'P0002', message = 'AI_CREDIT_POLICY_NOT_FOUND'; end if;
  if policy_row.is_active is not true then raise exception using errcode = 'P0001', message = 'AI_CREDIT_POLICY_INACTIVE'; end if;
  if p_upgrade_at < old_row.source_period_start or p_upgrade_at >= old_row.source_period_end then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_UPGRADE_TIME_INVALID';
  end if;
  snapshot_value := pg_catalog.to_jsonb(policy_row) - 'id' - 'created_at';
  remaining_seconds := extract(epoch from old_row.source_period_end - p_upgrade_at);
  term_seconds := extract(epoch from old_row.source_period_end - old_row.source_period_start);
  difference := greatest(0, pg_catalog.ceil(
    (policy_row.total_credits - old_row.total_credits)
      * least(remaining_seconds, term_seconds) / nullif(term_seconds, 0)));
  if difference <= 0 then return pg_catalog.jsonb_build_object('ok', true, 'granted_credits', 0); end if;
  insert into public.ai_credit_entitlement_periods (
    student_id, entitlement_identity, entitlement_type, plan_code, source_subscription_id,
    source_entitlement_period_id,
    source_period_start, source_period_end, policy_id, policy_snapshot,
    total_credits, rolling_5h_credits, daily_credits, expires_at
  ) values (
    p_student_id, p_upgrade_identity, 'upgrade', policy_row.plan_code, old_row.source_subscription_id,
    old_row.id, p_upgrade_at, old_row.source_period_end, policy_row.id,
    snapshot_value, difference,
    policy_row.rolling_5h_credits, policy_row.daily_credits, old_row.source_period_end
  ) on conflict (entitlement_identity) do nothing returning * into upgrade_row;
  if not found then select * into strict upgrade_row from public.ai_credit_entitlement_periods where entitlement_identity = p_upgrade_identity; end if;
  if upgrade_row.student_id is distinct from p_student_id
     or upgrade_row.entitlement_type is distinct from 'upgrade'
     or upgrade_row.plan_code is distinct from policy_row.plan_code
     or upgrade_row.source_subscription_id is distinct from old_row.source_subscription_id
     or upgrade_row.source_entitlement_period_id is distinct from old_row.id
     or upgrade_row.source_period_start is distinct from p_upgrade_at
     or upgrade_row.source_period_end is distinct from old_row.source_period_end
     or upgrade_row.policy_id is distinct from p_new_policy_id
     or upgrade_row.policy_snapshot is distinct from snapshot_value
     or upgrade_row.total_credits is distinct from difference
     or upgrade_row.rolling_5h_credits is distinct from policy_row.rolling_5h_credits
     or upgrade_row.daily_credits is distinct from policy_row.daily_credits
     or upgrade_row.expires_at is distinct from old_row.source_period_end then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_UPGRADE_IDEMPOTENCY_CONFLICT';
  end if;
  grant_identity_value := p_upgrade_identity || ':tranche:0';
  insert into public.ai_credit_grant_tranches (
    entitlement_period_id, grant_identity, tranche_index, credit_amount, available_at, expires_at, grant_kind
  ) values (upgrade_row.id, grant_identity_value, 0, difference,
    p_upgrade_at, old_row.source_period_end, 'upgrade') on conflict (grant_identity) do nothing;
  select * into strict grant_row from public.ai_credit_grant_tranches
    where grant_identity = grant_identity_value;
  if grant_row.entitlement_period_id is distinct from upgrade_row.id
     or grant_row.tranche_index is distinct from 0
     or grant_row.credit_amount is distinct from difference
     or grant_row.available_at is distinct from p_upgrade_at
     or grant_row.expires_at is distinct from old_row.source_period_end
     or grant_row.grant_kind is distinct from 'upgrade' then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_GRANT_IDEMPOTENCY_CONFLICT';
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'entitlement_period_id', upgrade_row.id,
    'granted_credits', difference);
end
$$;

create function public.read_ai_credit_limits_shadow(p_student_id text, p_at timestamptz default pg_catalog.statement_timestamp())
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'plan_code', e.plan_code, 'entitlement_type', e.entitlement_type,
    'period_start', e.source_period_start, 'period_end', e.source_period_end,
    'total_limit', e.total_credits, 'rolling_5h_limit', e.rolling_5h_credits,
    'daily_limit', e.daily_credits,
    'available_grants', coalesce((select sum(g.credit_amount) from public.ai_credit_grant_tranches g
      where g.entitlement_period_id = e.id and g.available_at <= p_at and g.expires_at > p_at), 0)
  ) order by e.source_period_start desc), '[]'::jsonb)
  from public.ai_credit_entitlement_periods e
  where e.student_id = p_student_id and e.source_period_start <= p_at and e.expires_at > p_at
$$;

alter table public.ai_credit_plan_policies enable row level security;
alter table public.ai_credit_plan_policies force row level security;
alter table public.ai_credit_entitlement_periods enable row level security;
alter table public.ai_credit_entitlement_periods force row level security;
alter table public.ai_credit_grant_tranches enable row level security;
alter table public.ai_credit_grant_tranches force row level security;

revoke all on table public.ai_credit_plan_policies, public.ai_credit_entitlement_periods,
  public.ai_credit_grant_tranches from public, anon, authenticated;
revoke all on function public.create_ai_credit_entitlement_shadow(text, uuid, text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.create_ai_credit_upgrade_shadow(text, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.read_ai_credit_limits_shadow(text, timestamptz) from public, anon, authenticated;
revoke all on function public.prevent_ai_credit_stage2_snapshot_mutation() from public, anon, authenticated;
grant execute on function public.create_ai_credit_entitlement_shadow(text, uuid, text, timestamptz, timestamptz, text) to service_role;
grant execute on function public.create_ai_credit_upgrade_shadow(text, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.read_ai_credit_limits_shadow(text, timestamptz) to service_role;

comment on table public.ai_credit_plan_policies is 'Inactive-by-default versioned Stage 2 plan policy; no enforcement or hosted seed.';
comment on table public.ai_credit_entitlement_periods is 'Immutable shadow entitlement-period snapshots aligned to subscription terms.';
comment on table public.ai_credit_grant_tranches is 'Immutable, idempotent shadow grant identities; not an enforcement balance.';

commit;
