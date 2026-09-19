begin;

-- Phase 1B.1 is persistence-only shadow accounting. It does not enforce a balance.
do $$
declare
  spec record;
  actual_type text;
  migration_role record;
begin
  if to_regclass('public.ai_usage_ledger') is null then
    raise exception 'PRECHECK: public.ai_usage_ledger is required';
  end if;

  for spec in select * from (values
    ('id', 'uuid'),
    ('student_id', 'text'),
    ('feature', 'text'),
    ('provider_call', 'text'),
    ('request_id', 'text'),
    ('idempotency_key', 'text'),
    ('retry_attempt', 'integer'),
    ('cost_nano_usd', 'numeric'),
    ('pricing_status', 'text'),
    ('price_version', 'text'),
    ('status', 'text'),
    ('metadata', 'jsonb'),
    ('created_at', 'timestamp with time zone')
  ) v(column_name, expected_type)
  loop
    select pg_catalog.format_type(a.atttypid, a.atttypmod)
      into actual_type
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.ai_usage_ledger'::pg_catalog.regclass
      and a.attname = spec.column_name
      and a.attnum > 0
      and not a.attisdropped;
    if actual_type is null or (spec.expected_type = 'numeric' and actual_type !~ '^numeric')
       or (spec.expected_type <> 'numeric' and actual_type <> spec.expected_type) then
      raise exception 'PRECHECK: ai_usage_ledger.% type mismatch: expected %, found %',
        spec.column_name, spec.expected_type, coalesce(actual_type, 'missing');
    end if;
  end loop;

  if (select count(*) from pg_catalog.pg_roles
      where rolname in ('service_role', 'anon', 'authenticated')) <> 3 then
    raise exception 'PRECHECK: required Supabase roles are missing';
  end if;

  select rolsuper, rolbypassrls into migration_role
  from pg_catalog.pg_roles where rolname = current_user;
  if not found or not (migration_role.rolsuper or migration_role.rolbypassrls) then
    raise exception 'PRECHECK: migration owner must bypass forced RLS for SECURITY DEFINER RPCs';
  end if;

  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('ai_credit_config', 'ai_credit_accounts',
        'ai_credit_reservations', 'ai_credit_transactions')
  ) or exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('reserve_ai_credit_shadow', 'settle_ai_credit_shadow',
        'release_ai_credit_shadow', 'prevent_ai_credit_transaction_mutation',
        'validate_ai_credit_action_minimums')
  ) then
    raise exception 'PRECHECK: existing AI credit object requires explicit compatibility review';
  end if;
end
$$;

create function public.validate_ai_credit_action_minimums(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  entry record;
  value_text text;
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object' then return false; end if;
  for entry in select key, value from pg_catalog.jsonb_each(p_value)
  loop
    if pg_catalog.jsonb_typeof(entry.value) <> 'string' then return false; end if;
    value_text := entry.value #>> '{}';
    if value_text !~ '^(0|[1-9][0-9]*)$' or pg_catalog.length(value_text) > 30 then
      return false;
    end if;
  end loop;
  return true;
end
$$;

create table public.ai_credit_config (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  config_version text not null unique,
  fx_rate_version text not null,
  formula_version text not null,
  usage_price_version text not null,
  fx_paise_per_usd numeric(30,0) not null,
  fx_safety_bps integer not null,
  markup_bps integer not null,
  credit_paise numeric(30,0) not null,
  action_minimum_credits jsonb not null default '{}'::jsonb,
  monthly_grant_credits numeric(30,0) not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint ai_credit_config_versions_nonempty check (
    pg_catalog.btrim(config_version) <> '' and pg_catalog.btrim(fx_rate_version) <> ''
    and pg_catalog.btrim(formula_version) <> '' and pg_catalog.btrim(usage_price_version) <> ''
  ),
  constraint ai_credit_config_values_check check (
    fx_paise_per_usd > 0 and fx_safety_bps between 1 and 100000
    and markup_bps between 1 and 100000 and credit_paise > 0
    and monthly_grant_credits >= 0
  ),
  constraint ai_credit_config_minimums_object check (
    public.validate_ai_credit_action_minimums(action_minimum_credits)
  ),
  constraint ai_credit_config_period_check check (
    effective_until is null or effective_until > effective_from
  )
);

create unique index ai_credit_config_one_active_uidx
  on public.ai_credit_config ((true)) where is_active;
create index ai_credit_config_effective_idx
  on public.ai_credit_config (effective_from desc, effective_until);

create table public.ai_credit_accounts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  student_id text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  period_timezone text not null default 'Asia/Kolkata',
  grant_config_id uuid not null references public.ai_credit_config(id) on delete restrict,
  grant_credits numeric(30,0) not null default 0,
  reserved_credits numeric(30,0) not null default 0,
  debited_credits numeric(30,0) not null default 0,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint ai_credit_accounts_period_key unique (student_id, period_start),
  constraint ai_credit_accounts_student_check check (
    pg_catalog.btrim(student_id) <> '' and student_id !~ '^[0-9]{10,15}$'
  ),
  constraint ai_credit_accounts_period_check check (
    period_timezone = 'Asia/Kolkata' and period_end > period_start
  ),
  constraint ai_credit_accounts_amounts_check check (
    grant_credits >= 0 and reserved_credits >= 0 and debited_credits >= 0
  )
);

create index ai_credit_accounts_student_period_idx
  on public.ai_credit_accounts (student_id, period_start desc);

create table public.ai_credit_reservations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.ai_credit_accounts(id) on delete restrict,
  config_id uuid not null references public.ai_credit_config(id) on delete restrict,
  ai_usage_ledger_id uuid not null unique references public.ai_usage_ledger(id) on delete restrict,
  idempotency_key text not null unique,
  request_id text not null,
  feature text not null,
  provider_call text not null,
  retry_attempt integer not null,
  state text not null default 'reserved',
  reserved_credits numeric(30,0) not null,
  settled_credits numeric(30,0),
  usage_price_version text not null,
  fx_rate_version text not null,
  config_version text not null,
  formula_version text not null,
  fx_paise_per_usd numeric(30,0) not null,
  fx_safety_bps integer not null,
  markup_bps integer not null,
  credit_paise numeric(30,0) not null,
  action_minimum_credits numeric(30,0) not null,
  exclusion_reason text,
  release_reason text,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  settled_at timestamptz,
  released_at timestamptz,
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint ai_credit_reservations_state_check check (state in ('reserved', 'settled', 'released')),
  constraint ai_credit_reservations_identity_check check (
    pg_catalog.btrim(idempotency_key) <> '' and pg_catalog.btrim(request_id) <> ''
    and pg_catalog.btrim(feature) <> '' and pg_catalog.btrim(provider_call) <> ''
    and retry_attempt >= 0
  ),
  constraint ai_credit_reservations_amounts_check check (
    reserved_credits >= 0 and action_minimum_credits >= 0
    and (settled_credits is null or settled_credits >= 0)
    and fx_paise_per_usd > 0 and fx_safety_bps > 0 and markup_bps > 0 and credit_paise > 0
  ),
  constraint ai_credit_reservations_state_shape check (
    (state = 'reserved' and settled_credits is null and settled_at is null and released_at is null)
    or (state = 'settled' and settled_credits is not null and settled_at is not null
        and released_at is null and exclusion_reason is null)
    or (state = 'released' and settled_credits is null and settled_at is null and released_at is not null)
  )
);

create index ai_credit_reservations_account_created_idx
  on public.ai_credit_reservations (account_id, created_at desc);
create index ai_credit_reservations_state_expiry_idx
  on public.ai_credit_reservations (state, expires_at) where state = 'reserved';

create table public.ai_credit_transactions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.ai_credit_accounts(id) on delete restrict,
  reservation_id uuid references public.ai_credit_reservations(id) on delete restrict,
  ai_usage_ledger_id uuid references public.ai_usage_ledger(id) on delete restrict,
  transaction_type text not null,
  credit_amount numeric(30,0) not null,
  balance_delta numeric(30,0) not null,
  idempotency_key text not null unique,
  usage_price_version text,
  fx_rate_version text,
  config_version text not null,
  formula_version text,
  fx_paise_per_usd numeric(30,0),
  fx_safety_bps integer,
  markup_bps integer,
  credit_paise numeric(30,0),
  action_minimum_credits numeric(30,0),
  provider_cost_nano_usd numeric(30,0),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint ai_credit_transactions_type_check check (
    transaction_type in ('monthly_grant', 'reserve', 'debit', 'release')
  ),
  constraint ai_credit_transactions_amount_check check (credit_amount >= 0),
  constraint ai_credit_transactions_shape_check check (
    (transaction_type = 'monthly_grant' and balance_delta = credit_amount
      and reservation_id is null and ai_usage_ledger_id is null)
    or (transaction_type = 'reserve' and balance_delta = 0
      and reservation_id is not null and ai_usage_ledger_id is not null)
    or (transaction_type = 'debit' and balance_delta = -credit_amount and credit_amount > 0
      and reservation_id is not null and ai_usage_ledger_id is not null)
    or (transaction_type = 'release' and balance_delta = 0
      and reservation_id is not null and ai_usage_ledger_id is not null)
  )
);

create unique index ai_credit_transactions_reservation_type_uidx
  on public.ai_credit_transactions (reservation_id, transaction_type)
  where reservation_id is not null;
create unique index ai_credit_transactions_usage_debit_uidx
  on public.ai_credit_transactions (ai_usage_ledger_id)
  where transaction_type = 'debit';
create index ai_credit_transactions_account_created_idx
  on public.ai_credit_transactions (account_id, created_at desc);

create function public.prevent_ai_credit_transaction_mutation()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'ai_credit_transactions is append-only';
end
$$;

create trigger ai_credit_transactions_append_only
before update or delete on public.ai_credit_transactions
for each row execute function public.prevent_ai_credit_transaction_mutation();

create function public.reserve_ai_credit_shadow(
  p_ai_usage_ledger_id uuid,
  p_ttl_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  usage_row public.ai_usage_ledger%rowtype;
  config_row public.ai_credit_config%rowtype;
  account_row public.ai_credit_accounts%rowtype;
  reservation_row public.ai_credit_reservations%rowtype;
  minimum_text text;
  minimum_credits numeric(30,0);
  period_start_value timestamptz;
  period_end_value timestamptz;
  inserted_reservation boolean := false;
begin
  if p_ai_usage_ledger_id is null or p_ttl_seconds not between 300 and 86400 then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_INVALID_RESERVATION_INPUT';
  end if;

  select * into usage_row from public.ai_usage_ledger
  where id = p_ai_usage_ledger_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'AI_USAGE_NOT_FOUND'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(usage_row.student_id, 119));

  select * into config_row from public.ai_credit_config
  where is_active is true
    and effective_from <= pg_catalog.statement_timestamp()
    and (effective_until is null or effective_until > pg_catalog.statement_timestamp())
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'AI_CREDIT_NO_ACTIVE_CONFIG'; end if;

  minimum_text := config_row.action_minimum_credits ->> usage_row.feature;
  if not public.validate_ai_credit_action_minimums(config_row.action_minimum_credits)
     or minimum_text is null or minimum_text !~ '^(0|[1-9][0-9]*)$'
     or pg_catalog.length(minimum_text) > 30 then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_ACTION_MINIMUM_INVALID';
  end if;
  begin
    minimum_credits := minimum_text::numeric(30,0);
  exception when numeric_value_out_of_range or invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_ACTION_MINIMUM_INVALID';
  end;

  period_start_value := pg_catalog.date_trunc('month',
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  period_end_value := (pg_catalog.date_trunc('month',
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata') + interval '1 month')
    at time zone 'Asia/Kolkata';

  insert into public.ai_credit_accounts (
    student_id, period_start, period_end, grant_config_id, grant_credits
  ) values (
    usage_row.student_id, period_start_value, period_end_value,
    config_row.id, config_row.monthly_grant_credits
  ) on conflict (student_id, period_start) do nothing;

  select * into account_row from public.ai_credit_accounts
  where student_id = usage_row.student_id and period_start = period_start_value
  for update;

  insert into public.ai_credit_transactions (
    account_id, transaction_type, credit_amount, balance_delta, idempotency_key,
    config_version, reason
  ) values (
    account_row.id, 'monthly_grant', account_row.grant_credits, account_row.grant_credits,
    'monthly-grant:' || account_row.id::text, config_row.config_version, 'monthly_shadow_grant'
  ) on conflict (idempotency_key) do nothing;

  insert into public.ai_credit_reservations (
    account_id, config_id, ai_usage_ledger_id, idempotency_key, request_id, feature, provider_call,
    retry_attempt, reserved_credits, usage_price_version, fx_rate_version,
    config_version, formula_version, fx_paise_per_usd, fx_safety_bps, markup_bps,
    credit_paise, action_minimum_credits, expires_at
  ) values (
    account_row.id, config_row.id, usage_row.id, usage_row.idempotency_key,
    usage_row.request_id, usage_row.feature, usage_row.provider_call,
    usage_row.retry_attempt, minimum_credits,
    config_row.usage_price_version, config_row.fx_rate_version, config_row.config_version,
    config_row.formula_version, config_row.fx_paise_per_usd, config_row.fx_safety_bps,
    config_row.markup_bps, config_row.credit_paise, minimum_credits,
    pg_catalog.statement_timestamp() + pg_catalog.make_interval(secs => p_ttl_seconds)
  ) on conflict (idempotency_key) do nothing
  returning * into reservation_row;

  if found then
    inserted_reservation := true;
    update public.ai_credit_accounts
    set reserved_credits = reserved_credits + minimum_credits,
        updated_at = pg_catalog.statement_timestamp()
    where id = account_row.id;

    insert into public.ai_credit_transactions (
      account_id, reservation_id, ai_usage_ledger_id, transaction_type,
      credit_amount, balance_delta, idempotency_key, usage_price_version,
      fx_rate_version, config_version, formula_version, fx_paise_per_usd,
      fx_safety_bps, markup_bps, credit_paise, action_minimum_credits, reason
    ) values (
      account_row.id, reservation_row.id, usage_row.id, 'reserve', minimum_credits, 0,
      'reserve:' || reservation_row.id::text, reservation_row.usage_price_version,
      reservation_row.fx_rate_version, reservation_row.config_version,
      reservation_row.formula_version, reservation_row.fx_paise_per_usd,
      reservation_row.fx_safety_bps, reservation_row.markup_bps,
      reservation_row.credit_paise, reservation_row.action_minimum_credits, 'shadow_estimate'
    );
  else
    select * into strict reservation_row from public.ai_credit_reservations
    where idempotency_key = usage_row.idempotency_key;
    if reservation_row.ai_usage_ledger_id <> usage_row.id
       or reservation_row.account_id <> account_row.id then
      raise exception using errcode = 'P0001', message = 'AI_CREDIT_IDEMPOTENCY_CONFLICT';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'reservation_id', reservation_row.id, 'account_id', reservation_row.account_id,
    'state', reservation_row.state, 'reserved_credits', reservation_row.reserved_credits,
    'already_reserved', not inserted_reservation
  );
end
$$;

create function public.settle_ai_credit_shadow(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  account_id_value uuid;
  usage_id_value uuid;
  account_row public.ai_credit_accounts%rowtype;
  reservation_row public.ai_credit_reservations%rowtype;
  usage_row public.ai_usage_ledger%rowtype;
  exclusion text;
  calculated numeric;
  final_charge numeric(30,0);
begin
  select account_id, ai_usage_ledger_id into account_id_value, usage_id_value
  from public.ai_credit_reservations
  where id = p_reservation_id;
  if not found then raise exception using errcode = 'P0002', message = 'AI_CREDIT_RESERVATION_NOT_FOUND'; end if;

  select * into usage_row from public.ai_usage_ledger
  where id = usage_id_value for update;
  if not found then raise exception using errcode = 'P0002', message = 'AI_USAGE_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(usage_row.student_id, 119));
  select * into strict account_row from public.ai_credit_accounts
  where id = account_id_value for update;
  select * into strict reservation_row from public.ai_credit_reservations
  where id = p_reservation_id for update;

  if reservation_row.account_id is distinct from account_row.id
     or reservation_row.ai_usage_ledger_id is distinct from usage_row.id then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_RELATIONSHIP_CONFLICT';
  end if;

  if usage_row.student_id is distinct from account_row.student_id
     or usage_row.idempotency_key is distinct from reservation_row.idempotency_key
     or usage_row.feature is distinct from reservation_row.feature
     or usage_row.provider_call is distinct from reservation_row.provider_call
     or usage_row.retry_attempt is distinct from reservation_row.retry_attempt then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_LEDGER_IDENTITY_CONFLICT';
  end if;

  if reservation_row.state = 'settled' then
    return pg_catalog.jsonb_build_object('ok', true, 'state', 'settled',
      'already_processed', true, 'charge_credits', reservation_row.settled_credits);
  elsif reservation_row.state = 'released' then
    return pg_catalog.jsonb_build_object('ok', true, 'state', 'released',
      'already_processed', true, 'exclusion_reason', reservation_row.exclusion_reason);
  end if;

  if usage_row.status = 'in_progress' then
    return pg_catalog.jsonb_build_object('ok', true, 'state', 'reserved', 'pending', true);
  elsif usage_row.status <> 'success' then exclusion := 'failed_usage';
  elsif usage_row.pricing_status = 'unknown' then exclusion := coalesce(usage_row.pricing_reason, 'unknown_usage');
  elsif usage_row.pricing_status = 'unpriced' then exclusion := coalesce(usage_row.pricing_reason, 'unpriced_usage');
  elsif usage_row.pricing_status <> 'priced' then exclusion := 'invalid_pricing_status';
  elsif pg_catalog.jsonb_typeof(usage_row.metadata->'authoritative_billing') is distinct from 'boolean'
     or usage_row.metadata->'authoritative_billing' <> 'true'::jsonb then exclusion := 'non_authoritative_usage';
  elsif usage_row.metadata ? 'client_reported' and (
      pg_catalog.jsonb_typeof(usage_row.metadata->'client_reported') is distinct from 'boolean'
      or usage_row.metadata->'client_reported' <> 'false'::jsonb
    ) then exclusion := 'client_reported_usage';
  elsif usage_row.cost_nano_usd is null or usage_row.cost_nano_usd < 0 then exclusion := 'invalid_provider_cost';
  elsif usage_row.price_version is distinct from reservation_row.usage_price_version then exclusion := 'usage_price_version_mismatch';
  end if;

  if exclusion is not null then
    update public.ai_credit_accounts
    set reserved_credits = reserved_credits - reservation_row.reserved_credits,
        updated_at = pg_catalog.statement_timestamp()
    where id = account_row.id;
    update public.ai_credit_reservations
    set state = 'released', exclusion_reason = exclusion, release_reason = 'settlement_excluded',
        released_at = pg_catalog.statement_timestamp(), updated_at = pg_catalog.statement_timestamp()
    where id = reservation_row.id;
    insert into public.ai_credit_transactions (
      account_id, reservation_id, ai_usage_ledger_id, transaction_type,
      credit_amount, balance_delta, idempotency_key, usage_price_version,
      fx_rate_version, config_version, formula_version, fx_paise_per_usd,
      fx_safety_bps, markup_bps, credit_paise, action_minimum_credits,
      provider_cost_nano_usd, reason
    ) values (
      account_row.id, reservation_row.id, usage_row.id, 'release',
      reservation_row.reserved_credits, 0, 'release:' || reservation_row.id::text,
      reservation_row.usage_price_version, reservation_row.fx_rate_version,
      reservation_row.config_version, reservation_row.formula_version,
      reservation_row.fx_paise_per_usd, reservation_row.fx_safety_bps,
      reservation_row.markup_bps, reservation_row.credit_paise,
      reservation_row.action_minimum_credits, usage_row.cost_nano_usd, exclusion
    );
    return pg_catalog.jsonb_build_object('ok', true, 'state', 'released',
      'exclusion_reason', exclusion, 'debited', false);
  end if;

  calculated := pg_catalog.ceil(
    (usage_row.cost_nano_usd * reservation_row.fx_paise_per_usd
      * reservation_row.fx_safety_bps * reservation_row.markup_bps)
    / (1000000000::numeric * 10000::numeric * 10000::numeric * reservation_row.credit_paise)
  );
  final_charge := greatest(calculated, reservation_row.action_minimum_credits);

  if final_charge <= 0 then
    exclusion := 'zero_charge';
    update public.ai_credit_accounts
    set reserved_credits = reserved_credits - reservation_row.reserved_credits,
        updated_at = pg_catalog.statement_timestamp()
    where id = account_row.id;
    update public.ai_credit_reservations
    set state = 'released', exclusion_reason = exclusion, release_reason = 'settlement_excluded',
        released_at = pg_catalog.statement_timestamp(), updated_at = pg_catalog.statement_timestamp()
    where id = reservation_row.id;
    insert into public.ai_credit_transactions (
      account_id, reservation_id, ai_usage_ledger_id, transaction_type, credit_amount,
      balance_delta, idempotency_key, config_version, reason
    ) values (account_row.id, reservation_row.id, usage_row.id, 'release',
      reservation_row.reserved_credits, 0, 'release:' || reservation_row.id::text,
      reservation_row.config_version, exclusion);
    return pg_catalog.jsonb_build_object('ok', true, 'state', 'released',
      'exclusion_reason', exclusion, 'debited', false);
  end if;

  -- Shadow mode intentionally has no grant, balance, or reservation ceiling check.
  update public.ai_credit_accounts
  set reserved_credits = reserved_credits - reservation_row.reserved_credits,
      debited_credits = debited_credits + final_charge,
      updated_at = pg_catalog.statement_timestamp()
  where id = account_row.id;
  update public.ai_credit_reservations
  set state = 'settled', settled_credits = final_charge,
      settled_at = pg_catalog.statement_timestamp(), updated_at = pg_catalog.statement_timestamp()
  where id = reservation_row.id;
  insert into public.ai_credit_transactions (
    account_id, reservation_id, ai_usage_ledger_id, transaction_type,
    credit_amount, balance_delta, idempotency_key, usage_price_version,
    fx_rate_version, config_version, formula_version, fx_paise_per_usd,
    fx_safety_bps, markup_bps, credit_paise, action_minimum_credits,
    provider_cost_nano_usd, reason
  ) values (
    account_row.id, reservation_row.id, usage_row.id, 'debit', final_charge, -final_charge,
    'debit:' || reservation_row.id::text, reservation_row.usage_price_version,
    reservation_row.fx_rate_version, reservation_row.config_version,
    reservation_row.formula_version, reservation_row.fx_paise_per_usd,
    reservation_row.fx_safety_bps, reservation_row.markup_bps,
    reservation_row.credit_paise, reservation_row.action_minimum_credits,
    usage_row.cost_nano_usd, 'authoritative_priced_success'
  );
  return pg_catalog.jsonb_build_object('ok', true, 'state', 'settled',
    'charge_credits', final_charge, 'debited', true);
end
$$;

create function public.release_ai_credit_shadow(
  p_reservation_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  account_id_value uuid;
  usage_id_value uuid;
  account_row public.ai_credit_accounts%rowtype;
  reservation_row public.ai_credit_reservations%rowtype;
  usage_row public.ai_usage_ledger%rowtype;
  release_reason_value text;
begin
  release_reason_value := pg_catalog.btrim(coalesce(p_reason, ''));
  if release_reason_value = '' then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_RELEASE_REASON_REQUIRED';
  end if;
  select account_id, ai_usage_ledger_id into account_id_value, usage_id_value
  from public.ai_credit_reservations
  where id = p_reservation_id;
  if not found then raise exception using errcode = 'P0002', message = 'AI_CREDIT_RESERVATION_NOT_FOUND'; end if;
  select * into usage_row from public.ai_usage_ledger where id = usage_id_value for update;
  if not found then raise exception using errcode = 'P0002', message = 'AI_USAGE_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(usage_row.student_id, 119));
  select * into strict account_row from public.ai_credit_accounts where id = account_id_value for update;
  select * into strict reservation_row from public.ai_credit_reservations where id = p_reservation_id for update;
  if reservation_row.account_id is distinct from account_row.id
     or reservation_row.ai_usage_ledger_id is distinct from usage_row.id
     or usage_row.student_id is distinct from account_row.student_id
     or usage_row.idempotency_key is distinct from reservation_row.idempotency_key
     or usage_row.feature is distinct from reservation_row.feature
     or usage_row.provider_call is distinct from reservation_row.provider_call
     or usage_row.retry_attempt is distinct from reservation_row.retry_attempt then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_LEDGER_IDENTITY_CONFLICT';
  end if;
  if reservation_row.state <> 'reserved' then
    return pg_catalog.jsonb_build_object('ok', true, 'state', reservation_row.state,
      'already_processed', true);
  end if;
  if usage_row.status = 'in_progress' then
    return pg_catalog.jsonb_build_object('ok', true, 'state', 'reserved',
      'pending', true, 'expired', reservation_row.expires_at <= pg_catalog.statement_timestamp());
  end if;
  update public.ai_credit_accounts
  set reserved_credits = reserved_credits - reservation_row.reserved_credits,
      updated_at = pg_catalog.statement_timestamp()
  where id = account_row.id;
  update public.ai_credit_reservations
  set state = 'released', release_reason = release_reason_value,
      exclusion_reason = coalesce(exclusion_reason, release_reason_value),
      released_at = pg_catalog.statement_timestamp(), updated_at = pg_catalog.statement_timestamp()
  where id = reservation_row.id;
  insert into public.ai_credit_transactions (
    account_id, reservation_id, ai_usage_ledger_id, transaction_type,
    credit_amount, balance_delta, idempotency_key, config_version, reason
  ) values (
    account_row.id, reservation_row.id, usage_row.id, 'release',
    reservation_row.reserved_credits, 0, 'release:' || reservation_row.id::text,
    reservation_row.config_version, release_reason_value
  );
  return pg_catalog.jsonb_build_object('ok', true, 'state', 'released', 'debited', false);
end
$$;

alter table public.ai_credit_config enable row level security;
alter table public.ai_credit_config force row level security;
alter table public.ai_credit_accounts enable row level security;
alter table public.ai_credit_accounts force row level security;
alter table public.ai_credit_reservations enable row level security;
alter table public.ai_credit_reservations force row level security;
alter table public.ai_credit_transactions enable row level security;
alter table public.ai_credit_transactions force row level security;

revoke all on table public.ai_credit_config, public.ai_credit_accounts,
  public.ai_credit_reservations, public.ai_credit_transactions from public, anon, authenticated;
revoke all on function public.reserve_ai_credit_shadow(uuid, integer) from public, anon, authenticated;
revoke all on function public.settle_ai_credit_shadow(uuid) from public, anon, authenticated;
revoke all on function public.release_ai_credit_shadow(uuid, text) from public, anon, authenticated;
revoke all on function public.prevent_ai_credit_transaction_mutation() from public, anon, authenticated;
revoke all on function public.validate_ai_credit_action_minimums(jsonb) from public, anon, authenticated;
grant execute on function public.reserve_ai_credit_shadow(uuid, integer) to service_role;
grant execute on function public.settle_ai_credit_shadow(uuid) to service_role;
grant execute on function public.release_ai_credit_shadow(uuid, text) to service_role;

comment on table public.ai_credit_config is 'Versioned, unseeded AI credit shadow pricing and grant configuration.';
comment on table public.ai_credit_accounts is 'Monthly IST shadow accounts; never used to enforce or block AI access.';
comment on table public.ai_credit_reservations is 'Idempotent shadow estimates linked one-to-one with AI usage ledger attempts.';
comment on table public.ai_credit_transactions is 'Append-only shadow credit audit events; not a spend authorization ledger.';

commit;
