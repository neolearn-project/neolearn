begin;

-- Stage 4 is a read-only activation-readiness monitor. It never reconciles or enforces.
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
  if (select pg_catalog.count(*) from pg_catalog.pg_roles
      where rolname in ('service_role', 'anon', 'authenticated')) <> 3 then
    raise exception 'PRECHECK: required Supabase roles are missing';
  end if;
  select rolsuper, rolbypassrls into migration_role
  from pg_catalog.pg_roles where rolname = current_user;
  if not found or not (migration_role.rolsuper or migration_role.rolbypassrls) then
    raise exception 'PRECHECK: migration owner must bypass forced RLS';
  end if;
  if pg_catalog.to_regprocedure(
       'public.read_ai_credit_operational_monitor(timestamp with time zone,integer,interval,integer,boolean)') is not null then
    raise exception 'PRECHECK: Stage 4 monitoring RPC already exists';
  end if;
  if pg_catalog.to_regprocedure('public.reconcile_ai_credit_shadow_terminal(integer)') is null
     or pg_catalog.to_regprocedure(
       'public.read_ai_credit_usage_shadow(text,uuid,timestamp with time zone)') is null then
    raise exception 'PRECHECK: compatible reconciliation and Stage 3 reporting RPCs are required';
  end if;
  if exists (
    select 1 from pg_catalog.pg_class c
    where c.oid in (
      'public.ai_credit_accounts'::pg_catalog.regclass,
      'public.ai_credit_reservations'::pg_catalog.regclass,
      'public.ai_credit_transactions'::pg_catalog.regclass,
      'public.ai_credit_plan_policies'::pg_catalog.regclass,
      'public.ai_credit_entitlement_periods'::pg_catalog.regclass,
      'public.ai_credit_grant_tranches'::pg_catalog.regclass
    ) and not c.relforcerowsecurity
  ) then
    raise exception 'PRECHECK: Stage 2/3 relations must retain forced RLS';
  end if;
end
$$;

create function public.read_ai_credit_operational_monitor(
  p_evaluated_at timestamptz,
  p_limit integer default 100,
  p_stale_after interval default interval '1 hour',
  p_near_limit_bps integer default 9000,
  p_include_identifiers boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  category_counts jsonb;
  exclusion_counts jsonb;
  usage_summary jsonb;
  latest_summary jsonb;
  findings jsonb;
begin
  if p_evaluated_at is null or p_limit is null or p_limit < 1 or p_limit > 500
     or p_stale_after is null or p_stale_after < interval '1 minute'
     or p_stale_after > interval '30 days'
     or p_near_limit_bps is null or p_near_limit_bps < 1 or p_near_limit_bps > 10000
     or p_include_identifiers is null then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_MONITOR_INPUT_INVALID';
  end if;

  with terminal_reserved as (
    select r.id, greatest(l.completed_at, l.created_at, r.updated_at) observed_at
    from public.ai_credit_reservations r
    join public.ai_usage_ledger l on l.id = r.ai_usage_ledger_id
    where r.state = 'reserved' and l.status in ('success', 'failure')
      and greatest(l.completed_at, l.created_at, r.updated_at) <= p_evaluated_at
  ), stale_attempt as (
    select l.id, l.started_at observed_at from public.ai_usage_ledger l
    where l.status = 'in_progress' and l.started_at <= p_evaluated_at - p_stale_after
  ), identity_issue as (
    select r.id, greatest(l.created_at, r.created_at, t.created_at) observed_at
    from public.ai_credit_reservations r
    left join public.ai_usage_ledger l on l.id = r.ai_usage_ledger_id
    left join public.ai_credit_accounts a on a.id = r.account_id
    left join public.ai_credit_transactions t on t.reservation_id = r.id
    where l.id is null or a.id is null
       or l.student_id is distinct from a.student_id
       or r.idempotency_key is distinct from l.idempotency_key
       or r.request_id is distinct from l.request_id
       or r.feature is distinct from l.feature
       or r.provider_call is distinct from l.provider_call
       or r.retry_attempt is distinct from l.retry_attempt
       or (t.id is not null and (t.account_id is distinct from r.account_id
           or t.ai_usage_ledger_id is distinct from r.ai_usage_ledger_id))
  ), transaction_orphan as (
    select t.id, t.created_at observed_at
    from public.ai_credit_transactions t
    left join public.ai_credit_reservations r on r.id = t.reservation_id
    left join public.ai_usage_ledger l on l.id = t.ai_usage_ledger_id
    left join public.ai_credit_accounts a on a.id = t.account_id
    where (t.reservation_id is not null and r.id is null)
       or (t.ai_usage_ledger_id is not null and l.id is null) or a.id is null
  ), settlement_issue as (
    select r.id, greatest(r.updated_at, max(t.created_at)) observed_at
    from public.ai_credit_reservations r
    left join public.ai_credit_transactions t on t.reservation_id = r.id
      and t.transaction_type in ('debit', 'release')
    group by r.id, r.state, r.settled_credits, r.updated_at
    having count(*) filter (where t.transaction_type = 'debit') > 1
       or count(*) filter (where t.transaction_type = 'release') > 1
       or (r.state = 'settled' and (count(*) filter (where t.transaction_type = 'debit') <> 1
           or max(t.credit_amount) filter (where t.transaction_type = 'debit') is distinct from r.settled_credits))
       or (r.state = 'released' and count(*) filter (where t.transaction_type = 'debit') > 0)
       or (r.state = 'reserved' and count(*) > 0)
  ), excluded_usage as (
    select l.id, l.created_at observed_at,
      case
        when l.status <> 'success' then 'non_terminal_or_failed'
        when l.pricing_status = 'unknown' then 'unknown_pricing'
        when l.pricing_status = 'unpriced' then 'unpriced'
        when pg_catalog.jsonb_typeof(l.metadata->'authoritative_billing') is distinct from 'boolean'
          or l.metadata->'authoritative_billing' <> 'true'::jsonb then 'non_authoritative'
        when pg_catalog.jsonb_typeof(l.metadata->'client_reported') = 'boolean'
          and l.metadata->'client_reported' = 'true'::jsonb then 'non_billable_client_reported'
        when r.exclusion_reason is not null then 'non_billable_excluded'
      end reason
    from public.ai_usage_ledger l
    left join public.ai_credit_reservations r on r.ai_usage_ledger_id = l.id
    where l.created_at <= p_evaluated_at and (l.status <> 'success' or l.pricing_status <> 'priced'
       or pg_catalog.jsonb_typeof(l.metadata->'authoritative_billing') is distinct from 'boolean'
       or l.metadata->'authoritative_billing' <> 'true'::jsonb
       or (pg_catalog.jsonb_typeof(l.metadata->'client_reported') = 'boolean'
           and l.metadata->'client_reported' = 'true'::jsonb)
       or r.exclusion_reason is not null)
  ), coverage_issue as (
    select e.id, e.source_period_start observed_at
    from public.ai_credit_entitlement_periods e
    left join public.ai_credit_plan_policies p on p.id = e.policy_id
    left join public.ai_credit_grant_tranches g on g.entitlement_period_id = e.id
    group by e.id, e.source_period_start, e.source_period_end, e.expires_at,
      e.total_credits, e.policy_snapshot, p.id, p.policy_version, p.tranche_count
    having p.id is null
       or e.policy_snapshot->>'policy_version' is distinct from p.policy_version
       or e.expires_at is distinct from e.source_period_end
       or count(g.id) = 0
       or count(g.id) > p.tranche_count
       or coalesce(sum(g.credit_amount), 0) > e.total_credits
       or bool_or(g.available_at < e.source_period_start or g.expires_at is distinct from e.expires_at)
  ), expired_period as (
    select e.id, e.expires_at observed_at from public.ai_credit_entitlement_periods e
    where e.expires_at <= p_evaluated_at
  ), expired_tranche as (
    select g.id, g.expires_at observed_at from public.ai_credit_grant_tranches g
    where g.expires_at <= p_evaluated_at
  ), all_counts as (
    select 'terminal_reserved_backlog' category, count(*) count from terminal_reserved union all
    select 'stale_in_progress', count(*) from stale_attempt union all
    select 'identity_mismatch_or_orphan', (select count(*) from identity_issue) + (select count(*) from transaction_orphan) union all
    select 'settlement_conflict', count(*) from settlement_issue union all
    select 'excluded_usage', count(*) from excluded_usage union all
    select 'policy_or_tranche_coverage', count(*) from coverage_issue union all
    select 'expired_period', count(*) from expired_period union all
    select 'expired_tranche', count(*) from expired_tranche
  )
  select pg_catalog.jsonb_object_agg(category, count order by category) into category_counts from all_counts;

  with excluded_usage as (
    select case
      when l.pricing_status = 'unknown' then 'unknown_pricing'
      when l.pricing_status = 'unpriced' then 'unpriced'
      when pg_catalog.jsonb_typeof(l.metadata->'authoritative_billing') is distinct from 'boolean'
        or l.metadata->'authoritative_billing' <> 'true'::jsonb then 'non_authoritative'
      when pg_catalog.jsonb_typeof(l.metadata->'client_reported') = 'boolean'
        and l.metadata->'client_reported' = 'true'::jsonb then 'non_billable_client_reported'
      when r.exclusion_reason is not null then 'non_billable_excluded'
      else 'non_terminal_or_failed' end reason
    from public.ai_usage_ledger l
    left join public.ai_credit_reservations r on r.ai_usage_ledger_id=l.id
    where l.created_at <= p_evaluated_at and (l.status <> 'success' or l.pricing_status <> 'priced'
      or pg_catalog.jsonb_typeof(l.metadata->'authoritative_billing') is distinct from 'boolean'
      or l.metadata->'authoritative_billing' <> 'true'::jsonb
      or (pg_catalog.jsonb_typeof(l.metadata->'client_reported')='boolean'
          and l.metadata->'client_reported'='true'::jsonb)
      or r.exclusion_reason is not null)
  ), reasons(reason) as (values ('unknown_pricing'),('unpriced'),('non_authoritative'),
    ('non_billable_client_reported'),('non_billable_excluded'),('non_terminal_or_failed'))
  select pg_catalog.jsonb_object_agg(reasons.reason,coalesce(c.count,0) order by reasons.reason)
  into exclusion_counts
  from reasons left join (select reason,count(*) count from excluded_usage group by reason) c using(reason);

  with eligible as (
    select e.id, e.student_id, e.source_period_start, e.source_period_end,
      coalesce((select sum(g.credit_amount) from public.ai_credit_grant_tranches g
        where g.entitlement_period_id=e.id and g.available_at <= p_evaluated_at
          and g.expires_at > p_evaluated_at),0) term_limit,
      e.rolling_5h_credits five_limit, e.daily_credits day_limit
    from public.ai_credit_entitlement_periods e
    where e.source_period_start <= p_evaluated_at and e.expires_at > p_evaluated_at
  ), measured as (
    select e.*,
      coalesce(sum(t.credit_amount),0) term_used,
      coalesce(sum(t.credit_amount) filter(where t.created_at > p_evaluated_at-interval '5 hours'),0) five_used,
      coalesce(sum(t.credit_amount) filter(where t.created_at > p_evaluated_at-interval '24 hours'),0) day_used
    from eligible e
    left join public.ai_credit_accounts a on a.student_id=e.student_id
    left join public.ai_credit_transactions t on t.account_id=a.id
      and t.transaction_type='debit' and t.created_at >= e.source_period_start
      and t.created_at < e.source_period_end and t.created_at <= p_evaluated_at
    left join public.ai_credit_reservations r on r.id=t.reservation_id and r.account_id=t.account_id
      and r.ai_usage_ledger_id=t.ai_usage_ledger_id and r.state='settled'
      and r.settled_credits=t.credit_amount and r.exclusion_reason is null
    left join public.ai_usage_ledger l on l.id=t.ai_usage_ledger_id and l.student_id=e.student_id
      and l.status='success' and l.pricing_status='priced'
      and l.metadata->'authoritative_billing'='true'::jsonb
      and (not(l.metadata?'client_reported') or l.metadata->'client_reported'='false'::jsonb)
    where t.id is null or (r.id is not null and l.id is not null)
    group by e.id,e.student_id,e.source_period_start,e.source_period_end,e.term_limit,e.five_limit,e.day_limit
  )
  select pg_catalog.jsonb_build_object(
    'active_entitlement_periods', count(*),
    'term_consumed', coalesce(sum(term_used),0),
    'rolling_5h_consumed', coalesce(sum(five_used),0),
    'rolling_24h_consumed', coalesce(sum(day_used),0),
    'term_exceeded', count(*) filter(where term_used > term_limit),
    'term_near_limit', count(*) filter(where term_limit > 0 and term_used <= term_limit and term_used*10000 >= term_limit*p_near_limit_bps),
    'rolling_5h_exceeded', count(*) filter(where five_used > five_limit),
    'rolling_5h_near_limit', count(*) filter(where five_limit > 0 and five_used <= five_limit and five_used*10000 >= five_limit*p_near_limit_bps),
    'rolling_24h_exceeded', count(*) filter(where day_used > day_limit),
    'rolling_24h_near_limit', count(*) filter(where day_limit > 0 and day_used <= day_limit and day_used*10000 >= day_limit*p_near_limit_bps)
  ) into usage_summary from measured;

  select pg_catalog.jsonb_build_object(
    'latest_ledger_created_at', (select max(created_at) from public.ai_usage_ledger where created_at <= p_evaluated_at),
    'latest_terminal_ledger_at', (select max(coalesce(completed_at,created_at)) from public.ai_usage_ledger where status in ('success','failure') and coalesce(completed_at,created_at) <= p_evaluated_at),
    'latest_reservation_updated_at', (select max(updated_at) from public.ai_credit_reservations where updated_at <= p_evaluated_at),
    'latest_transaction_at', (select max(created_at) from public.ai_credit_transactions where created_at <= p_evaluated_at),
    'latest_entitlement_period_start', (select max(source_period_start) from public.ai_credit_entitlement_periods where source_period_start <= p_evaluated_at),
    'latest_reconciliation_backlog_at', (select max(greatest(l.completed_at,l.created_at,r.updated_at))
      from public.ai_credit_reservations r join public.ai_usage_ledger l on l.id=r.ai_usage_ledger_id
      where r.state='reserved' and l.status in ('success','failure')
        and greatest(l.completed_at,l.created_at,r.updated_at) <= p_evaluated_at)
  ) into latest_summary;

  with anomaly as (
    select 'terminal_reserved_backlog' category, r.id entity_id, greatest(l.completed_at,l.created_at,r.updated_at) observed_at,
      pg_catalog.jsonb_build_object('ledger_status',l.status) detail
    from public.ai_credit_reservations r join public.ai_usage_ledger l on l.id=r.ai_usage_ledger_id
    where r.state='reserved' and l.status in ('success','failure')
      and greatest(l.completed_at,l.created_at,r.updated_at) <= p_evaluated_at
    union all
    select 'stale_in_progress', l.id, l.started_at,
      pg_catalog.jsonb_build_object('age_seconds',greatest(0,extract(epoch from p_evaluated_at-l.started_at)::bigint))
    from public.ai_usage_ledger l where l.status='in_progress' and l.started_at <= p_evaluated_at-p_stale_after
    union all
    select 'excluded_usage', l.id, l.created_at,
      pg_catalog.jsonb_build_object('pricing_status',l.pricing_status,'ledger_status',l.status)
    from public.ai_usage_ledger l left join public.ai_credit_reservations r on r.ai_usage_ledger_id=l.id
    where l.created_at <= p_evaluated_at and (l.status <> 'success' or l.pricing_status <> 'priced'
      or l.metadata->'authoritative_billing' is distinct from 'true'::jsonb or r.exclusion_reason is not null)
    union all
    select 'identity_mismatch_or_orphan',r.id,greatest(l.created_at,r.created_at),
      pg_catalog.jsonb_build_object('identity_consistent',false)
    from public.ai_credit_reservations r
    left join public.ai_usage_ledger l on l.id=r.ai_usage_ledger_id
    left join public.ai_credit_accounts a on a.id=r.account_id
    where r.created_at <= p_evaluated_at and (l.id is null or a.id is null
      or l.student_id is distinct from a.student_id
      or r.idempotency_key is distinct from l.idempotency_key
      or r.request_id is distinct from l.request_id or r.feature is distinct from l.feature
      or r.provider_call is distinct from l.provider_call or r.retry_attempt is distinct from l.retry_attempt)
    union all
    select 'settlement_conflict',r.id,greatest(r.updated_at,max(t.created_at)),
      pg_catalog.jsonb_build_object('reservation_state',r.state)
    from public.ai_credit_reservations r
    left join public.ai_credit_transactions t on t.reservation_id=r.id
      and t.transaction_type in ('debit','release')
    group by r.id,r.state,r.settled_credits,r.updated_at
    having (r.state='settled' and (count(*) filter(where t.transaction_type='debit')<>1
      or max(t.credit_amount) filter(where t.transaction_type='debit') is distinct from r.settled_credits))
      or (r.state='released' and count(*) filter(where t.transaction_type='debit')>0)
      or (r.state='reserved' and count(*)>0)
    union all
    select 'policy_or_tranche_coverage',e.id,e.source_period_start,
      pg_catalog.jsonb_build_object('coverage_consistent',false)
    from public.ai_credit_entitlement_periods e
    left join public.ai_credit_plan_policies p on p.id=e.policy_id
    left join public.ai_credit_grant_tranches g on g.entitlement_period_id=e.id
    group by e.id,e.source_period_start,e.source_period_end,e.expires_at,
      e.total_credits,e.policy_snapshot,p.id,p.policy_version,p.tranche_count
    having p.id is null or e.policy_snapshot->>'policy_version' is distinct from p.policy_version
      or count(g.id)=0 or count(g.id)>p.tranche_count
      or coalesce(sum(g.credit_amount),0)>e.total_credits
      or bool_or(g.available_at<e.source_period_start or g.expires_at is distinct from e.expires_at)
    union all
    select 'expired_period',e.id,e.expires_at,'{}'::jsonb from public.ai_credit_entitlement_periods e where e.expires_at<=p_evaluated_at
    union all
    select 'expired_tranche',g.id,g.expires_at,'{}'::jsonb from public.ai_credit_grant_tranches g where g.expires_at<=p_evaluated_at
  ), bounded as (
    select * from anomaly order by category, observed_at, entity_id limit p_limit
  )
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('category',category,'observed_at',observed_at,'details',detail)
      || case when p_include_identifiers then pg_catalog.jsonb_build_object('entity_id',entity_id)
              else '{}'::jsonb end
    order by category,observed_at,entity_id), '[]'::jsonb)
  into findings from bounded;

  return pg_catalog.jsonb_build_object(
    'observational_only',true, 'enforcement_active',false,
    'evaluated_at',p_evaluated_at, 'limit',p_limit,
    'stale_after_seconds',extract(epoch from p_stale_after)::bigint,
    'near_limit_bps',p_near_limit_bps, 'identifiers_included',p_include_identifiers,
    'category_counts',category_counts, 'exclusion_counts',exclusion_counts, 'shadow_usage',usage_summary,
    'latest_timestamps',latest_summary, 'findings',findings
  );
end
$$;

revoke all on function public.read_ai_credit_operational_monitor(timestamptz,integer,interval,integer,boolean)
  from public, anon, authenticated;
grant execute on function public.read_ai_credit_operational_monitor(timestamptz,integer,interval,integer,boolean)
  to service_role;

comment on function public.read_ai_credit_operational_monitor(timestamptz,integer,interval,integer,boolean) is
  'Stage 4 bounded, deterministic, read-only operational monitor. Never reconciles, repairs, activates, or enforces.';

commit;
