begin;

-- Stage 3 is reporting-only: no seeds, activation, grants, or enforcement.
do $$
declare
  relation_name text;
  migration_role record;
begin
  foreach relation_name in array array[
    'public.ai_usage_ledger', 'public.ai_credit_accounts',
    'public.ai_credit_reservations', 'public.ai_credit_transactions',
    'public.ai_credit_plan_policies', 'public.ai_credit_entitlement_periods',
    'public.ai_credit_grant_tranches'
  ] loop
    if pg_catalog.to_regclass(relation_name) is null then
      raise exception 'PRECHECK: required relation % is missing', relation_name;
    end if;
  end loop;
  if (select count(*) from pg_catalog.pg_roles
      where rolname in ('service_role', 'anon', 'authenticated')) <> 3 then
    raise exception 'PRECHECK: required Supabase roles are missing';
  end if;
  select rolsuper, rolbypassrls into migration_role
    from pg_catalog.pg_roles where rolname = current_user;
  if not found or not (migration_role.rolsuper or migration_role.rolbypassrls) then
    raise exception 'PRECHECK: migration owner must bypass forced RLS';
  end if;
  if pg_catalog.to_regprocedure(
       'public.read_ai_credit_usage_shadow(text,uuid,timestamp with time zone)') is not null then
    raise exception 'PRECHECK: Stage 3 reporting RPC already exists';
  end if;
  if pg_catalog.to_regprocedure('public.settle_ai_credit_shadow(uuid)') is null
     or pg_catalog.to_regprocedure(
       'public.read_ai_credit_limits_shadow(text,timestamp with time zone)') is null then
    raise exception 'PRECHECK: compatible shadow settlement and Stage 2 read RPCs are required';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.ai_credit_transactions'::pg_catalog.regclass
      and a.attname = 'created_at' and a.atttypid = 'timestamptz'::pg_catalog.regtype
      and a.attnum > 0 and not a.attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.ai_credit_transactions'::pg_catalog.regclass
      and a.attname = 'credit_amount' and a.atttypid = 'numeric'::pg_catalog.regtype
      and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'PRECHECK: incompatible AI credit transaction columns';
  end if;
end
$$;

create function public.read_ai_credit_usage_shadow(
  p_student_id text, p_entitlement_period_id uuid, p_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  entitlement_row public.ai_credit_entitlement_periods%rowtype;
  policy_version_value text;
  term_grant numeric(30,0);
  term_consumed numeric(30,0);
  rolling_5h_consumed numeric(30,0);
  rolling_24h_consumed numeric(30,0);
begin
  if pg_catalog.btrim(coalesce(p_student_id, '')) = ''
     or p_entitlement_period_id is null or p_at is null then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_USAGE_REPORT_INPUT_INVALID';
  end if;
  select * into entitlement_row
  from public.ai_credit_entitlement_periods e
  where e.id = p_entitlement_period_id and e.student_id = p_student_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'AI_CREDIT_ENTITLEMENT_NOT_FOUND';
  end if;
  if p_at < entitlement_row.source_period_start or p_at >= entitlement_row.source_period_end then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_EVALUATION_OUTSIDE_ENTITLEMENT';
  end if;
  select p.policy_version into strict policy_version_value
  from public.ai_credit_plan_policies p where p.id = entitlement_row.policy_id;
  select coalesce(pg_catalog.sum(g.credit_amount), 0) into term_grant
  from public.ai_credit_grant_tranches g
  where g.entitlement_period_id = entitlement_row.id
    and g.available_at <= p_at and g.expires_at > p_at;

  select
    coalesce(pg_catalog.sum(t.credit_amount), 0),
    coalesce(pg_catalog.sum(t.credit_amount) filter (
      where t.created_at > p_at - interval '5 hours'), 0),
    coalesce(pg_catalog.sum(t.credit_amount) filter (
      where t.created_at > p_at - interval '24 hours'), 0)
  into term_consumed, rolling_5h_consumed, rolling_24h_consumed
  from public.ai_credit_transactions t
  join public.ai_credit_reservations r
    on r.id = t.reservation_id and r.account_id = t.account_id
      and r.ai_usage_ledger_id = t.ai_usage_ledger_id
  join public.ai_credit_accounts a on a.id = t.account_id
  join public.ai_usage_ledger u on u.id = t.ai_usage_ledger_id
  where a.student_id = p_student_id and u.student_id = p_student_id
    and t.transaction_type = 'debit' and t.credit_amount > 0
    and t.balance_delta = -t.credit_amount
    and r.state = 'settled' and r.settled_credits = t.credit_amount
    and r.exclusion_reason is null
    and u.status = 'success' and u.pricing_status = 'priced'
    and pg_catalog.jsonb_typeof(u.metadata->'authoritative_billing') = 'boolean'
    and u.metadata->'authoritative_billing' = 'true'::jsonb
    and (not (u.metadata ? 'client_reported') or (
      pg_catalog.jsonb_typeof(u.metadata->'client_reported') = 'boolean'
      and u.metadata->'client_reported' = 'false'::jsonb
    ))
    and t.created_at >= entitlement_row.source_period_start
    and t.created_at < entitlement_row.source_period_end
    and t.created_at <= p_at;

  return pg_catalog.jsonb_build_object(
    'observational_only', true, 'student_id', p_student_id,
    'entitlement_period_id', entitlement_row.id,
    'entitlement_identity', entitlement_row.entitlement_identity,
    'policy_id', entitlement_row.policy_id,
    'policy_version', policy_version_value, 'plan_code', entitlement_row.plan_code,
    'evaluated_at', p_at, 'period_start', entitlement_row.source_period_start,
    'period_end', entitlement_row.source_period_end,
    'term', pg_catalog.jsonb_build_object(
      'grant', term_grant, 'consumed', term_consumed,
      'remaining', term_grant - term_consumed, 'exceeded', term_consumed > term_grant),
    'rolling_5h', pg_catalog.jsonb_build_object(
      'grant', entitlement_row.rolling_5h_credits, 'consumed', rolling_5h_consumed,
      'remaining', entitlement_row.rolling_5h_credits - rolling_5h_consumed,
      'exceeded', rolling_5h_consumed > entitlement_row.rolling_5h_credits),
    'rolling_24h', pg_catalog.jsonb_build_object(
      'grant', entitlement_row.daily_credits, 'consumed', rolling_24h_consumed,
      'remaining', entitlement_row.daily_credits - rolling_24h_consumed,
      'exceeded', rolling_24h_consumed > entitlement_row.daily_credits)
  );
end
$$;

revoke all on function public.read_ai_credit_usage_shadow(text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.read_ai_credit_usage_shadow(text, uuid, timestamptz)
  to service_role;
comment on function public.read_ai_credit_usage_shadow(text, uuid, timestamptz) is
  'Stage 3 shadow-only report. Windows are (p_at - interval, p_at], clipped to the selected entitlement term; never enforces.';

commit;
