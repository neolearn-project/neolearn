\set ON_ERROR_STOP on

do $$
declare
  reservation_id_value uuid;
  result jsonb;
  row_value record;
  race_state text;
  usage_id uuid;
  expected_large numeric;
begin
  -- Concurrent replay reserve and settle are each exactly once.
  if (select count(*) from public.ai_credit_reservations
      where ai_usage_ledger_id = '00000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'concurrent reserve was not idempotent';
  end if;
  select r.id, r.state, r.reserved_credits as estimate_credits, r.settled_credits,
         a.grant_credits, a.reserved_credits as account_reserved_credits, a.debited_credits
    into row_value
  from public.ai_credit_reservations r
  join public.ai_credit_accounts a on a.id = r.account_id
  where r.ai_usage_ledger_id = '00000000-0000-0000-0000-000000000001';
  if row_value.state <> 'settled' or row_value.estimate_credits <> 5
     or row_value.settled_credits <> 83 or row_value.grant_credits <> 10
     or row_value.account_reserved_credits <> 0 or row_value.debited_credits <> 83 then
    raise exception 'shadow debit or estimate mismatch: %', row_to_json(row_value);
  end if;
  if (select count(*) from public.ai_credit_transactions
      where reservation_id = row_value.id and transaction_type = 'debit') <> 1 then
    raise exception 'concurrent settlement duplicated debit';
  end if;

  -- Two concurrent first reservations share one account and one monthly grant.
  if (select count(*) from public.ai_credit_accounts where student_id = 'student:grant-race') <> 1 then
    raise exception 'monthly account race created duplicates';
  end if;
  if (select count(*) from public.ai_credit_transactions t
      join public.ai_credit_accounts a on a.id = t.account_id
      where a.student_id = 'student:grant-race' and t.transaction_type = 'monthly_grant') <> 1 then
    raise exception 'monthly grant race created duplicates';
  end if;

  -- Settle/release race reaches one terminal state with one terminal event.
  select id, state into reservation_id_value, race_state
  from public.ai_credit_reservations
  where ai_usage_ledger_id = '00000000-0000-0000-0000-000000000004';
  if race_state not in ('settled', 'released') then
    raise exception 'settle-release race was not terminal';
  end if;
  if (select count(*) from public.ai_credit_transactions
      where reservation_id = reservation_id_value and transaction_type in ('debit', 'release')) <> 1 then
    raise exception 'settle-release race produced conflicting terminal events';
  end if;

  -- Retry attempts are distinct; failure releases and success debits once.
  foreach usage_id in array array[
    '00000000-0000-0000-0000-000000000005'::uuid,
    '00000000-0000-0000-0000-000000000006'::uuid
  ] loop
    result := public.reserve_ai_credit_shadow(usage_id, 900);
    result := public.settle_ai_credit_shadow((result->>'reservation_id')::uuid);
  end loop;
  if (select count(*) from public.ai_credit_reservations r
      join public.ai_credit_accounts a on a.id = r.account_id
      where a.student_id = 'student:retry') <> 2 then
    raise exception 'retry attempts did not receive distinct reservations';
  end if;
  if (select count(*) from public.ai_credit_transactions t
      join public.ai_credit_accounts a on a.id = t.account_id
      where a.student_id = 'student:retry' and t.transaction_type = 'debit') <> 1 then
    raise exception 'retry flow did not debit exactly once';
  end if;
  if exists (select 1 from public.ai_credit_transactions
      where ai_usage_ledger_id = '00000000-0000-0000-0000-000000000005'
        and transaction_type = 'debit') then
    raise exception 'failed ledger attempt created a debit';
  end if;

  -- Every unsafe/non-authoritative class releases without a debit.
  foreach usage_id in array array[
    '00000000-0000-0000-0000-000000000007'::uuid,
    '00000000-0000-0000-0000-000000000008'::uuid,
    '00000000-0000-0000-0000-000000000009'::uuid,
    '00000000-0000-0000-0000-000000000010'::uuid,
    '00000000-0000-0000-0000-000000000011'::uuid,
    '00000000-0000-0000-0000-000000000015'::uuid,
    '00000000-0000-0000-0000-000000000016'::uuid
  ] loop
    result := public.reserve_ai_credit_shadow(usage_id, 900);
    result := public.settle_ai_credit_shadow((result->>'reservation_id')::uuid);
    if result->>'state' <> 'released' or (result->>'debited')::boolean is not false then
      raise exception 'non-billable usage was not released: %', usage_id;
    end if;
  end loop;
  if exists (
    select 1 from public.ai_credit_transactions
    where ai_usage_ledger_id in (
      '00000000-0000-0000-0000-000000000007',
      '00000000-0000-0000-0000-000000000008',
      '00000000-0000-0000-0000-000000000009',
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000015',
      '00000000-0000-0000-0000-000000000016'
    ) and transaction_type = 'debit'
  ) then raise exception 'excluded usage created a debit'; end if;

  -- The provider call is part of the immutable ledger identity.
  result := public.reserve_ai_credit_shadow('00000000-0000-0000-0000-000000000017', 900);
  reservation_id_value := (result->>'reservation_id')::uuid;
  update public.ai_usage_ledger set provider_call = 'responses.changed'
  where id = '00000000-0000-0000-0000-000000000017';
  begin
    perform public.settle_ai_credit_shadow(reservation_id_value);
    raise exception 'provider_call identity mismatch was accepted';
  exception when sqlstate 'P0001' then null;
  end;
  update public.ai_usage_ledger set provider_call = 'responses.create'
  where id = '00000000-0000-0000-0000-000000000017';

  -- An expired in-progress usage remains reserved even when release is requested.
  result := public.reserve_ai_credit_shadow('00000000-0000-0000-0000-000000000013', 300);
  reservation_id_value := (result->>'reservation_id')::uuid;
  update public.ai_credit_reservations set expires_at = statement_timestamp() - interval '1 second'
  where id = reservation_id_value;
  result := public.release_ai_credit_shadow(reservation_id_value, 'stale_scan');
  if result->>'state' <> 'reserved' or (result->>'pending')::boolean is not true then
    raise exception 'expired in-progress usage was incorrectly released';
  end if;

  -- Reservation snapshots survive config replacement.
  result := public.reserve_ai_credit_shadow('00000000-0000-0000-0000-000000000014', 900);
  reservation_id_value := (result->>'reservation_id')::uuid;
  update public.ai_credit_config set is_active = false where config_version = 'cfg-v1';
  insert into public.ai_credit_config (
    config_version, fx_rate_version, formula_version, usage_price_version,
    fx_paise_per_usd, fx_safety_bps, markup_bps, credit_paise,
    action_minimum_credits, monthly_grant_credits, effective_from, is_active
  ) values ('cfg-v2', 'fx-v2', 'future-formula', 'openai-test-v1', 9999, 20000,
    30000, 1, '{"teacher_qa":"999","large":"1"}', 999,
    statement_timestamp() - interval '1 minute', true);
  result := public.settle_ai_credit_shadow(reservation_id_value);
  if (result->>'charge_credits')::numeric <> 83 then
    raise exception 'settlement did not use immutable cfg-v1 snapshot: %', result;
  end if;

  -- Exact numeric arithmetic remains integral beyond JavaScript safe integers.
  result := public.reserve_ai_credit_shadow('00000000-0000-0000-0000-000000000012', 900);
  -- This reservation is cfg-v2, so compute the exact expected cfg-v2 result.
  reservation_id_value := (result->>'reservation_id')::uuid;
  result := public.settle_ai_credit_shadow(reservation_id_value);
  select ceil(99999999999999999999999999999::numeric * 9999 * 20000 * 30000
    / (1000000000::numeric * 10000 * 10000 * 1)) into expected_large;
  if (result->>'charge_credits')::numeric <> greatest(expected_large, 1) then
    raise exception 'large integer charge lost precision';
  end if;

  -- TTL bounds reject unsafe values.
  begin
    perform public.reserve_ai_credit_shadow('00000000-0000-0000-0000-000000000002', 299);
    raise exception 'invalid TTL accepted';
  exception when sqlstate 'P0001' then null;
  end;

  -- Accounts use exact calendar-month boundaries in IST.
  if exists (
    select 1 from public.ai_credit_accounts
    where extract(day from period_start at time zone 'Asia/Kolkata') <> 1
       or (period_start at time zone 'Asia/Kolkata')::time <> time '00:00:00'
       or period_end <> ((period_start at time zone 'Asia/Kolkata' + interval '1 month')
                         at time zone 'Asia/Kolkata')
  ) then raise exception 'IST account boundary mismatch'; end if;

  -- Transaction rows cannot be updated or deleted.
  begin
    update public.ai_credit_transactions set reason = 'tampered'
    where id = (select id from public.ai_credit_transactions limit 1);
    raise exception 'append-only transaction update succeeded';
  exception when raise_exception then
    if sqlerrm <> 'ai_credit_transactions is append-only' then raise; end if;
  end;

  -- Config rejects non-string, malformed and numeric-overflow action minimums.
  begin
    insert into public.ai_credit_config (
      config_version, fx_rate_version, formula_version, usage_price_version,
      fx_paise_per_usd, fx_safety_bps, markup_bps, credit_paise,
      action_minimum_credits, monthly_grant_credits, effective_from
    ) values ('bad-number', 'fx', 'formula', 'price', 1, 1, 1, 1,
      '{"teacher_qa":5}', 0, statement_timestamp());
    raise exception 'numeric JSON action minimum was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_credit_config (
      config_version, fx_rate_version, formula_version, usage_price_version,
      fx_paise_per_usd, fx_safety_bps, markup_bps, credit_paise,
      action_minimum_credits, monthly_grant_credits, effective_from
    ) values ('bad-leading-zero', 'fx', 'formula', 'price', 1, 1, 1, 1,
      '{"teacher_qa":"01"}', 0, statement_timestamp());
    raise exception 'malformed action minimum was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_credit_config (
      config_version, fx_rate_version, formula_version, usage_price_version,
      fx_paise_per_usd, fx_safety_bps, markup_bps, credit_paise,
      action_minimum_credits, monthly_grant_credits, effective_from
    ) values ('bad-overflow', 'fx', 'formula', 'price', 1, 1, 1, 1,
      '{"teacher_qa":"1234567890123456789012345678901"}', 0, statement_timestamp());
    raise exception 'overflow action minimum was accepted';
  exception when check_violation then null;
  end;
end
$$;

do $$
begin
  if (select count(*) from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
        and c.relname in ('ai_credit_config', 'ai_credit_accounts',
          'ai_credit_reservations', 'ai_credit_transactions')
        and c.relrowsecurity and c.relforcerowsecurity) <> 4 then
    raise exception 'RLS catalog check failed';
  end if;
  if exists (
    select 1 from unnest(array['anon','authenticated']) as r(role_name),
      unnest(array['public.ai_credit_config','public.ai_credit_accounts',
        'public.ai_credit_reservations','public.ai_credit_transactions']) as t(table_name),
      unnest(array['select','insert','update','delete','truncate']) as p(privilege_name)
    where has_table_privilege(role_name, table_name, privilege_name)
  ) then raise exception 'browser table privilege leaked'; end if;
  if exists (
    select 1 from unnest(array['anon','authenticated']) as r(role_name),
      unnest(array['public.reserve_ai_credit_shadow(uuid,integer)',
        'public.settle_ai_credit_shadow(uuid)',
        'public.release_ai_credit_shadow(uuid,text)']) as f(function_name)
    where has_function_privilege(role_name, function_name, 'execute')
  ) then raise exception 'browser RPC privilege leaked'; end if;
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,
      pg_catalog.acldefault('r', c.relowner))) acl
    where n.nspname = 'public' and c.relname like 'ai_credit_%' and acl.grantee = 0
  ) then raise exception 'PUBLIC table privilege leaked'; end if;
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,
      pg_catalog.acldefault('f', p.proowner))) acl
    where n.nspname = 'public'
      and p.proname in ('reserve_ai_credit_shadow','settle_ai_credit_shadow','release_ai_credit_shadow')
      and acl.grantee = 0
  ) then raise exception 'PUBLIC RPC privilege leaked'; end if;
end
$$;

-- Fixed function search_path must ignore hostile caller schemas.
create schema hostile;
create table hostile.ai_usage_ledger (id uuid);
set role service_role;
set search_path = hostile, public;
select public.reserve_ai_credit_shadow('00000000-0000-0000-0000-000000000002', 900);
reset role;
reset search_path;
