\set ON_ERROR_STOP on
create role service_role bypassrls;
create role anon;
create role authenticated;
\ir ../../supabase/migrations/20260912_ai_usage_ledger_v1.sql
\ir ../../supabase/migrations/20260919_ai_credit_shadow_persistence_v1.sql
\ir ../../supabase/migrations/20260921_ai_credit_shadow_terminal_reconciliation_v1.sql
\ir ../../supabase/migrations/20260922_ai_credit_plan_policy_v1.sql
\ir ../../supabase/migrations/20260925_ai_credit_shadow_limit_reporting_v1.sql
\ir ../../supabase/migrations/20260926_ai_credit_operational_monitoring_v1.sql

-- Dedicated Stage 4 fixtures. Evaluation time is 2026-06-15T12:00:00Z.
insert into public.ai_credit_config(id,config_version,fx_rate_version,formula_version,usage_price_version,
 fx_paise_per_usd,fx_safety_bps,markup_bps,credit_paise,action_minimum_credits,monthly_grant_credits,effective_from)
values('20000000-0000-0000-0000-000000000001','monitor-config','fx-v1','formula-v1','price-v1',9500,11000,25000,1,'{}',0,'2026-01-01Z');
insert into public.ai_credit_plan_policies(id,policy_version,plan_code,entitlement_type,total_credits,rolling_5h_credits,
 daily_credits,tranche_count,tranche_credits,tranche_interval_days,credit_paise,fx_paise_per_usd,fx_safety_bps,
 markup_bps,reservation_ttl_seconds,action_minimum_credits,non_billable_features,is_active,effective_from)
values
('10000000-0000-0000-0000-000000000001','monitor-v1','MONITOR','paid',100,50,80,1,100,0,1,9500,11000,25000,900,'{}','[]',false,'2026-01-01Z'),
('10000000-0000-0000-0000-000000000002','monitor-v1','MONITOR_NEAR','paid',100,100,100,1,100,0,1,9500,11000,25000,900,'{}','[]',false,'2026-01-01Z');
insert into public.ai_credit_entitlement_periods(id,student_id,entitlement_identity,entitlement_type,plan_code,
 source_subscription_id,source_period_start,source_period_end,policy_id,policy_snapshot,total_credits,
 rolling_5h_credits,daily_credits,expires_at,created_at)
values
('30000000-0000-0000-0000-000000000001','student:exceeded','entitlement:exceeded','paid','MONITOR','sub:exceeded','2026-06-01Z','2026-07-01Z','10000000-0000-0000-0000-000000000001','{"policy_version":"monitor-v1"}',100,50,80,'2026-07-01Z','2026-06-01Z'),
('30000000-0000-0000-0000-000000000002','student:near','entitlement:near','paid','MONITOR_NEAR','sub:near','2026-06-01Z','2026-07-01Z','10000000-0000-0000-0000-000000000002','{"policy_version":"monitor-v1"}',100,100,100,'2026-07-01Z','2026-06-01Z'),
('30000000-0000-0000-0000-000000000003','student:coverage','entitlement:coverage','paid','MONITOR','sub:coverage','2026-06-01Z','2026-07-01Z','10000000-0000-0000-0000-000000000001','{"policy_version":"conflicting-v0"}',100,50,80,'2026-07-01Z','2026-06-01Z'),
('30000000-0000-0000-0000-000000000004','student:expired','entitlement:expired','paid','MONITOR','sub:expired','2026-04-01Z','2026-05-01Z','10000000-0000-0000-0000-000000000001','{"policy_version":"monitor-v1"}',100,50,80,'2026-05-01Z','2026-04-01Z');
insert into public.ai_credit_grant_tranches(id,entitlement_period_id,grant_identity,tranche_index,credit_amount,available_at,expires_at,grant_kind,created_at)
values
('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','grant:exceeded',0,100,'2026-06-01Z','2026-07-01Z','term','2026-06-01Z'),
('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','grant:near',0,100,'2026-06-01Z','2026-07-01Z','term','2026-06-01Z'),
('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','grant:coverage',0,100,'2026-06-01Z','2026-07-01Z','term','2026-06-01Z'),
('40000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000004','grant:expired',0,100,'2026-04-01Z','2026-05-01Z','term','2026-04-01Z');
insert into public.ai_credit_accounts(id,student_id,period_start,period_end,grant_config_id,created_at,updated_at)
values
('50000000-0000-0000-0000-000000000001','student:ops','2026-06-01Z','2026-07-01Z','20000000-0000-0000-0000-000000000001','2026-06-01Z','2026-06-01Z'),
('50000000-0000-0000-0000-000000000002','student:exceeded','2026-06-01Z','2026-07-01Z','20000000-0000-0000-0000-000000000001','2026-06-01Z','2026-06-01Z'),
('50000000-0000-0000-0000-000000000003','student:near','2026-06-01Z','2026-07-01Z','20000000-0000-0000-0000-000000000001','2026-06-01Z','2026-06-01Z');

create function public.fixture_monitor_ledger(p_suffix integer,p_student text,p_status text,p_pricing text,p_metadata jsonb,p_started timestamptz)
returns uuid language plpgsql set search_path=pg_catalog,public as $$
declare uid uuid:=('60000000-0000-0000-0000-'||lpad(p_suffix::text,12,'0'))::uuid;
begin insert into public.ai_usage_ledger(id,student_id,feature,provider_call,model,request_id,idempotency_key,cost_nano_usd,
 pricing_status,price_version,status,metadata,started_at,completed_at,created_at)
 values(uid,p_student,'monitor','responses','fixture','request:'||p_suffix,'key:'||p_suffix,
 case when p_pricing='priced' then 1 end,p_pricing,'price-v1',p_status,p_metadata,p_started,
 case when p_status in('success','failure') then p_started::timestamptz else null::timestamptz end,
 p_started); return uid; end $$;
select public.fixture_monitor_ledger(1,'student:ops','success','priced','{"authoritative_billing":true}','2026-06-15T09:00Z');
select public.fixture_monitor_ledger(2,'student:ops','in_progress','unknown','{}','2026-06-15T09:01Z');
select public.fixture_monitor_ledger(3,'student:ops','success','priced','{"authoritative_billing":true}','2026-06-15T09:02Z');
select public.fixture_monitor_ledger(4,'student:ops','success','priced','{"authoritative_billing":true}','2026-06-15T09:03Z');
select public.fixture_monitor_ledger(5,'student:ops','success','unknown','{"authoritative_billing":true}','2026-06-15T09:04Z');
select public.fixture_monitor_ledger(6,'student:ops','success','unpriced','{"authoritative_billing":true}','2026-06-15T09:05Z');
select public.fixture_monitor_ledger(7,'student:ops','success','priced','{"authoritative_billing":false}','2026-06-15T09:06Z');
select public.fixture_monitor_ledger(8,'student:ops','success','priced','{"authoritative_billing":true,"client_reported":true}','2026-06-15T09:07Z');
select public.fixture_monitor_ledger(9,'student:ops','success','priced','{"authoritative_billing":true}','2026-06-15T09:08Z');
select public.fixture_monitor_ledger(10,'student:exceeded','success','priced','{"authoritative_billing":true}','2026-06-15T11:00Z');
select public.fixture_monitor_ledger(11,'student:near','success','priced','{"authoritative_billing":true}','2026-06-15T11:01Z');

create function public.fixture_monitor_reservation(p_suffix integer,p_ledger integer,p_account uuid,p_state text,
 p_reserved numeric,p_settled numeric,p_request text default null,p_exclusion text default null)
returns uuid language plpgsql set search_path=pg_catalog,public as $$
declare rid uuid:=('70000000-0000-0000-0000-'||lpad(p_suffix::text,12,'0'))::uuid;
begin insert into public.ai_credit_reservations(id,account_id,config_id,ai_usage_ledger_id,idempotency_key,request_id,
 feature,provider_call,retry_attempt,state,reserved_credits,settled_credits,usage_price_version,fx_rate_version,
 config_version,formula_version,fx_paise_per_usd,fx_safety_bps,markup_bps,credit_paise,action_minimum_credits,
 exclusion_reason,release_reason,expires_at,created_at,settled_at,released_at,updated_at)
 values(rid,p_account,'20000000-0000-0000-0000-000000000001',('60000000-0000-0000-0000-'||lpad(p_ledger::text,12,'0'))::uuid,
 'key:'||p_ledger,coalesce(p_request,'request:'||p_ledger),'monitor','responses',0,p_state,p_reserved,p_settled,
 'price-v1','fx-v1','monitor-config','formula-v1',9500,11000,25000,1,0,p_exclusion,
 case when p_state='released' then 'fixture_excluded' end,'2026-06-15T10:00Z','2026-06-15T09:00Z',
 case when p_state='settled' then '2026-06-15T09:30:00Z'::timestamptz else null::timestamptz end,
 case when p_state='released' then '2026-06-15T09:30:00Z'::timestamptz else null::timestamptz end,
 '2026-06-15T09:30:00Z');
 return rid; end $$;
select public.fixture_monitor_reservation(1,1,'50000000-0000-0000-0000-000000000001','reserved',10,null);
select public.fixture_monitor_reservation(3,3,'50000000-0000-0000-0000-000000000001','reserved',10,null,'request:mismatch');
select public.fixture_monitor_reservation(4,4,'50000000-0000-0000-0000-000000000001','settled',10,10);
select public.fixture_monitor_reservation(9,9,'50000000-0000-0000-0000-000000000001','released',10,null,null,'non_billable_feature');
select public.fixture_monitor_reservation(10,10,'50000000-0000-0000-0000-000000000002','settled',110,110);
select public.fixture_monitor_reservation(11,11,'50000000-0000-0000-0000-000000000003','settled',90,90);
insert into public.ai_credit_transactions(id,account_id,reservation_id,ai_usage_ledger_id,transaction_type,credit_amount,balance_delta,idempotency_key,config_version,created_at)
values
('80000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000004','60000000-0000-0000-0000-000000000004','debit',9,-9,'debit:4','monitor-config','2026-06-15T09:31Z'),
('80000000-0000-0000-0000-000000000010','50000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000010','60000000-0000-0000-0000-000000000010','debit',110,-110,'debit:10','monitor-config','2026-06-15T11:00Z'),
('80000000-0000-0000-0000-000000000011','50000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000011','60000000-0000-0000-0000-000000000011','debit',90,-90,'debit:11','monitor-config','2026-06-15T11:01Z');

do $$ declare result jsonb; categories text[]:='{}'; before_counts jsonb; after_counts jsonb; begin
 select jsonb_build_array((select count(*) from public.ai_usage_ledger),(select count(*) from public.ai_credit_accounts),(select count(*) from public.ai_credit_reservations),(select count(*) from public.ai_credit_transactions),(select count(*) from public.ai_credit_entitlement_periods),(select count(*) from public.ai_credit_grant_tranches)) into before_counts;
 result:=public.read_ai_credit_operational_monitor('2026-06-15T12:00Z',500,interval '1 hour',9000,true);
 select array_agg(value->>'category') into categories from jsonb_array_elements(result->'findings');
 if exists(select 1 from jsonb_array_elements(result->'findings') x where (x->>'entity_id')::uuid is null) then raise exception 'finding UUID missing'; end if;
 if result->>'observational_only'<>'true' or result->>'enforcement_active'<>'false' then raise exception 'not observational'; end if;
 if (result#>>'{category_counts,terminal_reserved_backlog}')::int<1 or (result#>>'{category_counts,stale_in_progress}')::int<1 or (result#>>'{category_counts,identity_mismatch_or_orphan}')::int<1 or (result#>>'{category_counts,settlement_conflict}')::int<1 or (result#>>'{category_counts,excluded_usage}')::int<1 or (result#>>'{category_counts,policy_or_tranche_coverage}')::int<1 or (result#>>'{category_counts,expired_period}')::int<1 or (result#>>'{category_counts,expired_tranche}')::int<1 then raise exception 'category count missing: %',result; end if;
 if not categories @> array['terminal_reserved_backlog','stale_in_progress','identity_mismatch_or_orphan','settlement_conflict','excluded_usage','policy_or_tranche_coverage','expired_period','expired_tranche'] then raise exception 'detailed finding missing: %',categories; end if;
 if (result#>>'{exclusion_counts,unknown_pricing}')::int<1 or (result#>>'{exclusion_counts,unpriced}')::int<1 or (result#>>'{exclusion_counts,non_authoritative}')::int<1 or (result#>>'{exclusion_counts,non_billable_client_reported}')::int<1 or (result#>>'{exclusion_counts,non_billable_excluded}')::int<1 then raise exception 'exclusion missing: %',result; end if;
 if (result#>>'{shadow_usage,term_exceeded}')::int<1 or (result#>>'{shadow_usage,rolling_5h_exceeded}')::int<1 or (result#>>'{shadow_usage,rolling_24h_exceeded}')::int<1 or (result#>>'{shadow_usage,term_near_limit}')::int<1 or (result#>>'{shadow_usage,rolling_5h_near_limit}')::int<1 or (result#>>'{shadow_usage,rolling_24h_near_limit}')::int<1 then raise exception 'usage readiness missing: %',result; end if;
 select jsonb_build_array((select count(*) from public.ai_usage_ledger),(select count(*) from public.ai_credit_accounts),(select count(*) from public.ai_credit_reservations),(select count(*) from public.ai_credit_transactions),(select count(*) from public.ai_credit_entitlement_periods),(select count(*) from public.ai_credit_grant_tranches)) into after_counts;
 if after_counts is distinct from before_counts then raise exception 'monitor wrote data'; end if;
end $$;

do $$ declare full_result jsonb; bounded jsonb; begin
 bounded:=public.read_ai_credit_operational_monitor('2026-06-15T12:00Z',3,interval '1 hour',9000,false);
 if jsonb_array_length(bounded->'findings')<>3 or bounded::text~'student:|request:|key:|entitlement:' or bounded::text~'"entity_id"' then raise exception 'bound/redaction failed: %',bounded; end if;
 if bounded is distinct from public.read_ai_credit_operational_monitor('2026-06-15T12:00Z',3,interval '1 hour',9000,false) then raise exception 'bounded read nondeterministic'; end if;
 full_result:=public.read_ai_credit_operational_monitor('2026-06-15T12:00Z',500,interval '1 hour',9000,false);
 if bounded->'category_counts' is distinct from full_result->'category_counts' then raise exception 'limit changed counts'; end if;
 begin perform public.read_ai_credit_operational_monitor(now(),0); raise exception 'zero accepted'; exception when sqlstate 'P0001' then null; end;
 begin perform public.read_ai_credit_operational_monitor(now(),501); raise exception 'large accepted'; exception when sqlstate 'P0001' then null; end;
end $$;

do $$ begin
 if not exists(select 1 from pg_proc where oid='public.read_ai_credit_operational_monitor(timestamptz,integer,interval,integer,boolean)'::regprocedure and pronargs=5 and pronargdefaults=4 and proargmodes is null and provolatile='s' and prosecdef and proconfig@>array['search_path=pg_catalog, public']) then raise exception 'RPC contract mismatch'; end if;
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where p.oid='public.read_ai_credit_operational_monitor(timestamptz,integer,interval,integer,boolean)'::regprocedure and x.grantee=0 and x.privilege_type='EXECUTE') or has_function_privilege('anon','public.read_ai_credit_operational_monitor(timestamptz,integer,interval,integer,boolean)','execute') or has_function_privilege('authenticated','public.read_ai_credit_operational_monitor(timestamptz,integer,interval,integer,boolean)','execute') or not has_function_privilege('service_role','public.read_ai_credit_operational_monitor(timestamptz,integer,interval,integer,boolean)','execute') then raise exception 'RPC ACL mismatch'; end if;
 if exists(select 1 from pg_class where oid in('public.ai_credit_accounts'::regclass,'public.ai_credit_reservations'::regclass,'public.ai_credit_transactions'::regclass,'public.ai_credit_entitlement_periods'::regclass,'public.ai_credit_grant_tranches'::regclass) and not relforcerowsecurity) then raise exception 'forced RLS lost'; end if;
end $$;
set role anon;
\set ON_ERROR_STOP off
select public.read_ai_credit_operational_monitor('2026-06-15Z');
\if :ERROR = false
 \echo 'ACL check unexpectedly succeeded'
 \quit 3
\endif
\set ON_ERROR_STOP on
reset role;
