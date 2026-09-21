\set ON_ERROR_STOP on

create role service_role;
create role anon;
create role authenticated;

\ir ../../supabase/migrations/20260912_ai_usage_ledger_v1.sql
\ir ../../supabase/migrations/20260919_ai_credit_shadow_persistence_v1.sql

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'settle_ai_credit_shadow'
      and p.proargnames[1] = 'p_reservation_id'
  ) or not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'release_ai_credit_shadow'
      and p.proargnames[1:2] = array['p_reservation_id', 'p_reason']
  ) then
    raise exception 'named terminal RPC parameters are required by this fixture';
  end if;
end
$$;

\ir ../../supabase/migrations/20260921_ai_credit_shadow_terminal_reconciliation_v1.sql

insert into public.ai_credit_config (
  config_version, fx_rate_version, formula_version, usage_price_version,
  fx_paise_per_usd, fx_safety_bps, markup_bps, credit_paise,
  action_minimum_credits, monthly_grant_credits, effective_from, is_active
) values (
  'reconcile-cfg', 'reconcile-fx', 'reconcile-formula', 'reconcile-price',
  8300, 10000, 10000, 100, '{"teacher_qa":"5"}', 10,
  statement_timestamp() - interval '1 hour', true
);

insert into public.ai_usage_ledger (
  id, student_id, feature, provider, provider_call, model, request_id,
  idempotency_key, retry_attempt, cost_nano_usd, pricing_status,
  price_version, status, metadata, started_at, created_at
) values
('00000000-0000-4000-8000-000000000101', 'reconcile:success', 'teacher_qa', 'openai', 'responses.create', 'model', 'reconcile-success', 'reconcile-success:0', 0, 1000000000, 'priced', 'reconcile-price', 'success', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-4000-8000-000000000102', 'reconcile:failure', 'teacher_qa', 'openai', 'responses.create', 'model', 'reconcile-failure', 'reconcile-failure:0', 0, null, 'unknown', 'reconcile-price', 'failure', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-4000-8000-000000000103', 'reconcile:excluded', 'teacher_qa', 'openai', 'responses.create', 'model', 'reconcile-excluded', 'reconcile-excluded:0', 0, null, 'unknown', 'reconcile-price', 'success', '{"authoritative_billing":false}', statement_timestamp(), statement_timestamp()),
('00000000-0000-4000-8000-000000000104', 'reconcile:live', 'teacher_qa', 'openai', 'responses.create', 'model', 'reconcile-live', 'reconcile-live:0', 0, null, 'unknown', 'reconcile-price', 'in_progress', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp());

select public.reserve_ai_credit_shadow('00000000-0000-4000-8000-000000000101', 900);
select public.reserve_ai_credit_shadow('00000000-0000-4000-8000-000000000102', 900);
select public.reserve_ai_credit_shadow('00000000-0000-4000-8000-000000000103', 900);
select public.reserve_ai_credit_shadow('00000000-0000-4000-8000-000000000104', 900);

select public.reconcile_ai_credit_shadow_terminal(50);
select public.reconcile_ai_credit_shadow_terminal(50);

do $$
begin
  begin
    perform public.reconcile_ai_credit_shadow_terminal(0);
    raise exception 'invalid batch was accepted';
  exception when sqlstate 'P0001' then null;
  end;
end
$$;

do $$
declare
  live_state text;
  settled_count integer;
  released_count integer;
begin
  select state into live_state from public.ai_credit_reservations
    where ai_usage_ledger_id = '00000000-0000-4000-8000-000000000104';
  if live_state <> 'reserved' then raise exception 'live reservation was mutated'; end if;

  select count(*) into settled_count from public.ai_credit_reservations
    where state = 'settled';
  select count(*) into released_count from public.ai_credit_reservations
    where state = 'released';
  if settled_count <> 1 or released_count <> 2 then
    raise exception 'terminal reconciliation counts mismatch';
  end if;

  if has_function_privilege('anon', 'public.reconcile_ai_credit_shadow_terminal(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reconcile_ai_credit_shadow_terminal(integer)', 'EXECUTE')
     or has_function_privilege('public', 'public.reconcile_ai_credit_shadow_terminal(integer)', 'EXECUTE') then
    raise exception 'browser/public RPC privilege remains';
  end if;
end
$$;
