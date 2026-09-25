\set ON_ERROR_STOP on
create role service_role bypassrls;
create role anon;
create role authenticated;
\ir ../../supabase/migrations/20260912_ai_usage_ledger_v1.sql
\ir ../../supabase/migrations/20260919_ai_credit_shadow_persistence_v1.sql
\ir ../../supabase/migrations/20260921_ai_credit_shadow_terminal_reconciliation_v1.sql
\ir ../../supabase/migrations/20260922_ai_credit_plan_policy_v1.sql
\ir ../../supabase/migrations/20260925_ai_credit_shadow_limit_reporting_v1.sql

do $$
begin
  if (select count(*) from public.ai_credit_plan_policies) <> 0
     or (select count(*) from public.ai_credit_entitlement_periods) <> 0
     or (select count(*) from public.ai_credit_grant_tranches) <> 0 then
    raise exception 'Stage 3 seeded data';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.read_ai_credit_usage_shadow(text,uuid,timestamptz)'::regprocedure
      and p.pronargs = 3 and p.pronargdefaults = 0 and p.proargmodes is null
      and p.proargtypes = array['text'::regtype,'uuid'::regtype,'timestamptz'::regtype]::oidvector
      and p.provolatile = 's' and p.prosecdef
      and p.proconfig @> array['search_path=pg_catalog, public']
  ) then raise exception 'Stage 3 RPC signature/security mismatch'; end if;
  if exists (
       select 1
       from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege
       where p.oid = 'public.read_ai_credit_usage_shadow(text,uuid,timestamptz)'::regprocedure
         and privilege.grantee = 0
         and privilege.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', 'public.read_ai_credit_usage_shadow(text,uuid,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.read_ai_credit_usage_shadow(text,uuid,timestamptz)', 'execute')
     or not has_function_privilege('service_role', 'public.read_ai_credit_usage_shadow(text,uuid,timestamptz)', 'execute') then
    raise exception 'Stage 3 RPC ACL mismatch';
  end if;
  if not exists (select 1 from pg_class where oid='public.ai_credit_transactions'::regclass and relforcerowsecurity)
     or not exists (select 1 from pg_class where oid='public.ai_credit_entitlement_periods'::regclass and relforcerowsecurity) then
    raise exception 'forced RLS was not preserved';
  end if;
end $$;

insert into public.ai_credit_config (
  id, config_version, fx_rate_version, formula_version, usage_price_version,
  fx_paise_per_usd, fx_safety_bps, markup_bps, credit_paise,
  action_minimum_credits, monthly_grant_credits, effective_from
) values ('20000000-0000-0000-0000-000000000001','fixture-config','fx-v1','formula-v1','price-v1',
  9500,11000,25000,1,'{}',0,'2026-01-01Z');

insert into public.ai_credit_plan_policies (
  id, policy_version, plan_code, entitlement_type, total_credits, rolling_5h_credits,
  daily_credits, tranche_count, tranche_credits, tranche_interval_days,
  credit_paise, fx_paise_per_usd, fx_safety_bps, markup_bps, reservation_ttl_seconds,
  action_minimum_credits, non_billable_features, is_active, effective_from
) values
('10000000-0000-0000-0000-000000000001','fixture-v1','TRIAL','trial',500,100,200,1,500,0,1,9500,11000,25000,900,'{}','[]',true,'2026-01-01Z'),
('10000000-0000-0000-0000-000000000002','fixture-v1','REGULAR_MONTHLY','paid',12000,1200,2400,1,12000,0,1,9500,11000,25000,900,'{}','[]',true,'2026-01-01Z'),
('10000000-0000-0000-0000-000000000003','fixture-v1','REGULAR_QUARTERLY','paid',36000,1200,2400,3,12000,30,1,9500,11000,25000,900,'{}','[]',true,'2026-01-01Z'),
('10000000-0000-0000-0000-000000000004','fixture-v1','COMPETITIVE_MONTHLY','paid',30000,3000,6000,1,30000,0,1,9500,11000,25000,900,'{}','[]',true,'2026-01-01Z');

select public.create_ai_credit_entitlement_shadow('student:windows','10000000-0000-0000-0000-000000000002','windows:p1','2026-01-01Z','2026-01-31Z','windows');
select public.create_ai_credit_entitlement_shadow('student:other','10000000-0000-0000-0000-000000000002','other:p1','2026-01-01Z','2026-01-31Z','other');
select public.create_ai_credit_entitlement_shadow('student:renewal','10000000-0000-0000-0000-000000000002','renewal:p1','2026-01-01Z','2026-01-31Z','renewal');
select public.create_ai_credit_entitlement_shadow('student:renewal','10000000-0000-0000-0000-000000000004','renewal:p2','2026-01-31Z','2026-03-02Z','renewal');
select public.create_ai_credit_entitlement_shadow('student:quarterly','10000000-0000-0000-0000-000000000003','quarterly:p1','2026-01-01Z','2026-04-01Z','quarterly');
select public.create_ai_credit_entitlement_shadow('student:exceeded','10000000-0000-0000-0000-000000000001','exceeded:p1','2026-01-01Z','2026-01-31Z',null);

create function public.fixture_stage3_debit(
  p_student text, p_at timestamptz, p_credit numeric,
  p_usage_status text default 'success', p_pricing text default 'priced',
  p_reservation_state text default 'settled', p_metadata jsonb default '{"authoritative_billing":true}'::jsonb
) returns void language plpgsql set search_path=pg_catalog,public as $$
declare aid uuid; uid uuid := gen_random_uuid(); rid uuid := gen_random_uuid(); key_value text := uid::text;
begin
  insert into public.ai_credit_accounts(student_id,period_start,period_end,grant_config_id)
    values(p_student,'2026-01-01Z','2026-04-01Z','20000000-0000-0000-0000-000000000001')
    on conflict(student_id,period_start) do nothing;
  select id into strict aid from public.ai_credit_accounts where student_id=p_student and period_start='2026-01-01Z';
  insert into public.ai_usage_ledger(id,student_id,feature,provider_call,model,request_id,idempotency_key,
    cost_nano_usd,pricing_status,price_version,status,metadata,created_at,completed_at)
    values(uid,p_student,'fixture','responses','fixture',key_value,key_value,1,p_pricing,'price-v1',p_usage_status,p_metadata,p_at,p_at);
  insert into public.ai_credit_reservations(id,account_id,config_id,ai_usage_ledger_id,idempotency_key,
    request_id,feature,provider_call,retry_attempt,state,reserved_credits,settled_credits,
    usage_price_version,fx_rate_version,config_version,formula_version,fx_paise_per_usd,
    fx_safety_bps,markup_bps,credit_paise,action_minimum_credits,expires_at,created_at,settled_at,released_at)
  values(rid,aid,'20000000-0000-0000-0000-000000000001',uid,key_value,key_value,'fixture','responses',0,
    p_reservation_state,p_credit,case when p_reservation_state='settled' then p_credit end,
    'price-v1','fx-v1','fixture-config','formula-v1',9500,11000,25000,1,0,p_at+interval '1 hour',p_at,
    case when p_reservation_state='settled' then p_at end,
    case when p_reservation_state='released' then p_at end);
  insert into public.ai_credit_transactions(account_id,reservation_id,ai_usage_ledger_id,transaction_type,
    credit_amount,balance_delta,idempotency_key,config_version,created_at)
    values(aid,rid,uid,'debit',p_credit,-p_credit,'debit:'||rid::text,'fixture-config',p_at);
end $$;

select public.fixture_stage3_debit('student:windows','2026-01-10T07:00:00Z',10);
select public.fixture_stage3_debit('student:windows','2026-01-10T07:00:00.001Z',20);
select public.fixture_stage3_debit('student:windows','2026-01-09T12:00:00Z',30);
select public.fixture_stage3_debit('student:windows','2026-01-09T12:00:00.001Z',40);
select public.fixture_stage3_debit('student:windows','2026-01-10T12:00:00Z',50);
select public.fixture_stage3_debit('student:windows','2026-01-10T12:00:00.001Z',1000);
select public.fixture_stage3_debit('student:windows','2026-01-10T11:00:00Z',100,'in_progress');
select public.fixture_stage3_debit('student:windows','2026-01-10T11:00:01Z',100,'failure');
select public.fixture_stage3_debit('student:windows','2026-01-10T11:00:02Z',100,'success','unknown');
select public.fixture_stage3_debit('student:windows','2026-01-10T11:00:03Z',100,'success','unpriced');
select public.fixture_stage3_debit('student:windows','2026-01-10T11:00:04Z',100,'success','priced','reserved');
select public.fixture_stage3_debit('student:windows','2026-01-10T11:00:05Z',100,'success','priced','released');
select public.fixture_stage3_debit('student:windows','2026-01-10T11:00:06Z',100,'success','priced','settled','{"authoritative_billing":false}');
select public.fixture_stage3_debit('student:windows','2026-01-10T11:00:07Z',100,'success','priced','settled','{"authoritative_billing":true,"client_reported":false}');
select public.fixture_stage3_debit('student:other','2026-01-10T11:00:00Z',500);
select public.fixture_stage3_debit('student:renewal','2026-01-30T23:59:59.999Z',10);
select public.fixture_stage3_debit('student:renewal','2026-01-31T00:00:00Z',20);
select public.fixture_stage3_debit('student:exceeded','2026-01-10T12:00:00Z',550);

do $$
declare result jsonb; eid uuid;
begin
  select id into eid from public.ai_credit_entitlement_periods where entitlement_identity='windows:p1';
  result := public.read_ai_credit_usage_shadow('student:windows',eid,'2026-01-10T12:00:00Z');
  if result#>>'{term,consumed}' <> '250' or result#>>'{rolling_5h,consumed}' <> '170'
     or result#>>'{rolling_24h,consumed}' <> '220' then raise exception 'window boundary/exclusion failure: %',result; end if;
  if result#>>'{term,grant}' <> '12000' or result#>>'{term,remaining}' <> '11750'
     or result#>>'{rolling_5h,grant}' <> '1200' or result#>>'{rolling_24h,grant}' <> '2400' then
    raise exception 'grant/remaining failure: %',result; end if;
  if result->>'observational_only' <> 'true' or result->>'policy_version' <> 'fixture-v1' then
    raise exception 'observational/policy identity failure'; end if;

  select id into eid from public.ai_credit_entitlement_periods where entitlement_identity='renewal:p1';
  result := public.read_ai_credit_usage_shadow('student:renewal',eid,'2026-01-30T23:59:59.999Z');
  if result#>>'{term,consumed}' <> '10' or result->>'plan_code' <> 'REGULAR_MONTHLY' then raise exception 'old renewal isolation'; end if;
  select id into eid from public.ai_credit_entitlement_periods where entitlement_identity='renewal:p2';
  result := public.read_ai_credit_usage_shadow('student:renewal',eid,'2026-01-31T00:00:00Z');
  if result#>>'{term,consumed}' <> '20' or result#>>'{term,grant}' <> '30000'
     or result->>'plan_code' <> 'COMPETITIVE_MONTHLY' then raise exception 'renewal/no-rollover isolation: %',result; end if;

  select id into eid from public.ai_credit_entitlement_periods where entitlement_identity='quarterly:p1';
  if public.read_ai_credit_usage_shadow('student:quarterly',eid,'2026-01-01Z')#>>'{term,grant}' <> '12000'
     or public.read_ai_credit_usage_shadow('student:quarterly',eid,'2026-01-31Z')#>>'{term,grant}' <> '24000'
     or public.read_ai_credit_usage_shadow('student:quarterly',eid,'2026-03-02Z')#>>'{term,grant}' <> '36000' then
    raise exception 'quarterly available tranche failure'; end if;

  select id into eid from public.ai_credit_entitlement_periods where entitlement_identity='exceeded:p1';
  result := public.read_ai_credit_usage_shadow('student:exceeded',eid,'2026-01-10T12:00:00Z');
  if result#>>'{term,remaining}' <> '-50' or result#>>'{term,exceeded}' <> 'true'
     or result#>>'{rolling_5h,exceeded}' <> 'true' or result#>>'{rolling_24h,exceeded}' <> 'true' then
    raise exception 'exceeded reporting failure: %',result; end if;

  begin perform public.read_ai_credit_usage_shadow('student:other',eid,'2026-01-10Z');
    raise exception 'student isolation failed'; exception when sqlstate 'P0002' then null; end;
  begin perform public.read_ai_credit_usage_shadow('student:exceeded',eid,'2026-01-31Z');
    raise exception 'period end was inclusive'; exception when sqlstate 'P0001' then null; end;
  if public.read_ai_credit_usage_shadow('student:exceeded',eid,'2026-01-10T12:00:00Z')
     is distinct from public.read_ai_credit_usage_shadow('student:exceeded',eid,'2026-01-10T12:00:00Z') then
    raise exception 'repeated read was nondeterministic'; end if;
end $$;

select id as windows_eid from public.ai_credit_entitlement_periods
  where entitlement_identity='windows:p1' \gset
set role anon;
\set ON_ERROR_STOP off
select public.read_ai_credit_usage_shadow(
  'student:windows', :'windows_eid'::uuid, '2026-01-10Z');
\if :ERROR = false
  \echo 'ACL check unexpectedly succeeded'
  \quit 3
\endif
\set ON_ERROR_STOP on
reset role;
