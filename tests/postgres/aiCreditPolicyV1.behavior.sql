\set ON_ERROR_STOP on
create role service_role bypassrls;
create role anon;
create role authenticated;
\ir ../../supabase/migrations/20260912_ai_usage_ledger_v1.sql
\ir ../../supabase/migrations/20260919_ai_credit_shadow_persistence_v1.sql
\ir ../../supabase/migrations/20260922_ai_credit_plan_policy_v1.sql

do $$
begin
  if (select count(*) from public.ai_credit_plan_policies) <> 0
     or (select count(*) from public.ai_credit_entitlement_periods) <> 0
     or (select count(*) from public.ai_credit_grant_tranches) <> 0 then
    raise exception 'Stage 2 migration seeded data';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.ai_credit_plan_policies'::regclass and relforcerowsecurity)
     or not exists (select 1 from pg_class where oid = 'public.ai_credit_entitlement_periods'::regclass and relforcerowsecurity)
     or not exists (select 1 from pg_class where oid = 'public.ai_credit_grant_tranches'::regclass and relforcerowsecurity) then
    raise exception 'forced RLS missing';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('create_ai_credit_entitlement_shadow','create_ai_credit_upgrade_shadow','read_ai_credit_limits_shadow')) <> 3 then
    raise exception 'RPC signatures missing';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.create_ai_credit_entitlement_shadow(text,uuid,text,timestamptz,timestamptz,text)'::regprocedure
      and p.pronargs = 6
      and p.proargtypes = ARRAY['text'::regtype,'uuid'::regtype,'text'::regtype,
        'timestamptz'::regtype,'timestamptz'::regtype,'text'::regtype]::oidvector
      and p.proargmodes is null
      and p.pronargdefaults = 1
  ) then
    raise exception 'entitlement RPC signature changed';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.create_ai_credit_upgrade_shadow(text,uuid,uuid,text,timestamptz)'::regprocedure
      and p.pronargs = 5
      and p.proargtypes = ARRAY['text'::regtype,'uuid'::regtype,'uuid'::regtype,
        'text'::regtype,'timestamptz'::regtype]::oidvector
      and p.proargmodes is null
      and p.pronargdefaults = 0
  ) then
    raise exception 'upgrade RPC signature changed';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.read_ai_credit_limits_shadow(text,timestamptz)'::regprocedure
      and p.pronargs = 2
      and p.proargtypes = ARRAY['text'::regtype,'timestamptz'::regtype]::oidvector
      and p.proargmodes is null
      and p.pronargdefaults = 1
  ) then
    raise exception 'read RPC signature changed';
  end if;
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace
      and proname in ('create_ai_credit_entitlement_shadow','create_ai_credit_upgrade_shadow','read_ai_credit_limits_shadow')
      and prosecdef and proconfig @> ARRAY['search_path=pg_catalog, public']) <> 3 then
    raise exception 'RPC security definition/search_path missing';
  end if;
  if (select coalesce(bool_or((x.grantee = 0) and ((x.privilege_type = 'EXECUTE') or (x.is_grantable))), false)
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
      where p.pronamespace='public'::regnamespace
        and p.proname in ('create_ai_credit_entitlement_shadow','create_ai_credit_upgrade_shadow','read_ai_credit_limits_shadow'))
     or (select count(*) from pg_proc p where p.pronamespace='public'::regnamespace
        and p.proname in ('create_ai_credit_entitlement_shadow','create_ai_credit_upgrade_shadow','read_ai_credit_limits_shadow')
        and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute')
          or not has_function_privilege('service_role', p.oid, 'execute'))) <> 0 then
    raise exception 'RPC ACL is not service-role-only';
  end if;
end $$;

insert into public.ai_credit_plan_policies (
  id, policy_version, plan_code, entitlement_type, total_credits, rolling_5h_credits,
  daily_credits, tranche_count, tranche_credits, tranche_interval_days,
  credit_paise, fx_paise_per_usd, fx_safety_bps, markup_bps, reservation_ttl_seconds,
  action_minimum_credits, non_billable_features, is_active, effective_from
) values
('10000000-0000-0000-0000-000000000001','fixture-v1','TRIAL','trial',500,100,200,1,500,0,1,9500,11000,25000,900,
 '{}','["lesson_audio","teacher_math_audio","avatar_lesson","realtime_voice_session","realtime_voice"]',true,'2026-01-01Z'),
('10000000-0000-0000-0000-000000000002','fixture-v1','REGULAR_MONTHLY','paid',12000,1200,2400,1,12000,0,1,9500,11000,25000,900,'{}','[]',true,'2026-01-01Z'),
('10000000-0000-0000-0000-000000000003','fixture-v1','REGULAR_QUARTERLY','paid',36000,1200,2400,3,12000,30,1,9500,11000,25000,900,'{}','[]',true,'2026-01-01Z'),
('10000000-0000-0000-0000-000000000004','fixture-v1','COMPETITIVE_MONTHLY','paid',30000,3000,6000,1,30000,0,1,9500,11000,25000,900,'{}','[]',true,'2026-01-01Z');

insert into public.ai_credit_plan_policies (
  id, policy_version, plan_code, entitlement_type, total_credits, rolling_5h_credits,
  daily_credits, tranche_count, tranche_credits, tranche_interval_days,
  credit_paise, fx_paise_per_usd, fx_safety_bps, markup_bps, reservation_ttl_seconds,
  action_minimum_credits, non_billable_features, effective_from
) values ('10000000-0000-0000-0000-000000000005','fixture-v1','INACTIVE_TEST','paid',100,10,20,1,100,0,
  1,9500,11000,25000,900,'{}','[]','2026-01-01Z');

select public.create_ai_credit_entitlement_shadow('student:trial','10000000-0000-0000-0000-000000000001','trial:student:trial','2026-01-01T00:00:00Z','2026-02-15T00:00:00Z',null);
select public.create_ai_credit_entitlement_shadow('student:renewal','10000000-0000-0000-0000-000000000002','subscription:1:period:1','2026-01-01T00:00:00Z','2026-01-31T00:00:00Z','subscription:1');
select public.create_ai_credit_entitlement_shadow('student:renewal','10000000-0000-0000-0000-000000000002','subscription:1:period:2','2026-01-31T00:00:00Z','2026-03-02T00:00:00Z','subscription:1');
select public.create_ai_credit_entitlement_shadow('student:quarterly','10000000-0000-0000-0000-000000000003','subscription:q:period:1','2026-01-01T00:00:00Z','2026-04-01T00:00:00Z','subscription:q');
select public.create_ai_credit_upgrade_shadow('student:renewal',(select id from public.ai_credit_entitlement_periods where entitlement_identity='subscription:1:period:2'),'10000000-0000-0000-0000-000000000004','subscription:1:upgrade:1','2026-02-15T00:00:00Z');

do $$
declare rejected boolean := false; value numeric;
begin
  if jsonb_array_length(public.read_ai_credit_limits_shadow('student:trial','2026-01-01T00:00:00Z')) <> 1 then raise exception 'trial period was not authoritative'; end if;
  value := (public.read_ai_credit_limits_shadow('student:quarterly','2025-12-31T23:59:59.999Z')->0->>'available_grants')::numeric; if value <> 0 then raise exception 'before tranche'; end if;
  value := (public.read_ai_credit_limits_shadow('student:quarterly','2026-01-01T00:00:00Z')->0->>'available_grants')::numeric; if value <> 12000 then raise exception 'first tranche'; end if;
  value := (public.read_ai_credit_limits_shadow('student:quarterly','2026-01-31T00:00:00Z')->0->>'available_grants')::numeric; if value <> 24000 then raise exception 'second tranche'; end if;
  value := (public.read_ai_credit_limits_shadow('student:quarterly','2026-03-02T00:00:00Z')->0->>'available_grants')::numeric; if value <> 36000 then raise exception 'third tranche'; end if;
  if jsonb_array_length(public.read_ai_credit_limits_shadow('student:quarterly','2026-04-01T00:00:00Z')) <> 0 then raise exception 'quarterly expiry'; end if;
  if (public.read_ai_credit_limits_shadow('student:renewal','2026-01-31T00:00:00Z')->0->>'available_grants')::numeric <> 12000 then raise exception 'renewal rollover'; end if;
  begin perform public.create_ai_credit_entitlement_shadow('student:trial','10000000-0000-0000-0000-000000000001','trial:student:trial:again','2026-03-01Z','2026-03-08Z',null); exception when unique_violation then rejected := true; end;
  if not rejected then raise exception 'trial uniqueness'; end if;
  rejected := false;
  begin perform public.create_ai_credit_entitlement_shadow('student:renewal','10000000-0000-0000-0000-000000000002','subscription:1:period:2','2026-01-31Z','2026-03-03Z','subscription:1'); exception when sqlstate 'P0001' then rejected := true; end;
  if not rejected then raise exception 'conflicting replay'; end if;
  rejected := false;
  begin perform public.create_ai_credit_entitlement_shadow('student:inactive','10000000-0000-0000-0000-000000000005','inactive:1','2026-01-01Z','2026-01-31Z',null); exception when sqlstate 'P0001' then rejected := true; end;
  if not rejected then raise exception 'inactive issuance'; end if;
  rejected := false;
  begin perform public.create_ai_credit_entitlement_shadow('student:bad-quarter','10000000-0000-0000-0000-000000000003','bad-quarter:1','2026-01-01Z','2026-04-02Z','bad-quarter'); exception when sqlstate 'P0001' then rejected := true; end;
  if not rejected then raise exception 'incompatible quarterly period'; end if;
  if (select count(*) from public.ai_credit_entitlement_periods where student_id='student:renewal') <> 3 then raise exception 'renewal or upgrade periods'; end if;
  if (select total_credits from public.ai_credit_entitlement_periods where entitlement_identity='subscription:1:upgrade:1') <> 9000 then raise exception 'proration'; end if;
  if public.create_ai_credit_upgrade_shadow('student:renewal',(select id from public.ai_credit_entitlement_periods where entitlement_identity='subscription:1:period:2'),'10000000-0000-0000-0000-000000000001','downgrade:1','2026-02-15Z')->>'granted_credits' <> '0' then raise exception 'downgrade'; end if;
  if public.create_ai_credit_upgrade_shadow('student:renewal',(select id from public.ai_credit_entitlement_periods where entitlement_identity='subscription:1:period:2'),'10000000-0000-0000-0000-000000000002','equal:1','2026-02-15Z')->>'granted_credits' <> '0' then raise exception 'equal upgrade'; end if;
  rejected := false;
  begin perform public.create_ai_credit_upgrade_shadow('student:renewal',(select id from public.ai_credit_entitlement_periods where entitlement_identity='subscription:1:period:2'),'10000000-0000-0000-0000-000000000004','bad:before','2025-12-31Z'); exception when sqlstate 'P0001' then rejected := true; end;
  if not rejected then raise exception 'early upgrade'; end if;
  rejected := false;
  begin perform public.create_ai_credit_upgrade_shadow('student:renewal',(select id from public.ai_credit_entitlement_periods where entitlement_identity='subscription:1:period:2'),'10000000-0000-0000-0000-000000000004','bad:after','2026-03-02Z'); exception when sqlstate 'P0001' then rejected := true; end;
  if not rejected then raise exception 'late upgrade'; end if;
  rejected := false;
  begin update public.ai_credit_entitlement_periods set plan_code='tampered' where entitlement_identity='subscription:1:period:1'; exception when others then rejected := true; end;
  if not rejected then raise exception 'snapshot update'; end if;
  rejected := false;
  begin delete from public.ai_credit_grant_tranches where grant_identity='subscription:q:period:1:tranche:0'; exception when others then rejected := true; end;
  if not rejected then raise exception 'grant delete'; end if;
  if (select count(*) from public.ai_credit_plan_policies) <> 5
     or (select count(*) from public.ai_credit_plan_policies where is_active) <> 4
     or (select count(*) from public.ai_credit_plan_policies where not is_active) <> 1 then
    raise exception 'fixture policy count';
  end if;
end $$;

set role anon;
\set ON_ERROR_STOP off
select public.read_ai_credit_limits_shadow('student:trial','2026-01-02Z');
\if :ERROR = false
  \echo 'ACL check unexpectedly succeeded'
  \quit 3
\endif
\set ON_ERROR_STOP on
reset role;
