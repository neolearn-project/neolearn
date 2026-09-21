begin;

do $$
declare
  fn record;
  found_settle boolean := false;
  found_release boolean := false;
begin
  if to_regclass('public.ai_credit_reservations') is null
     or to_regclass('public.ai_usage_ledger') is null then
    raise exception 'PRECHECK: AI credit reservations and usage ledger are required';
  end if;

  for fn in
    select p.proname, p.pronargs, p.proargtypes, p.proargmodes
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('settle_ai_credit_shadow', 'release_ai_credit_shadow')
  loop
    if (fn.proname = 'settle_ai_credit_shadow' and not (
          fn.pronargs = 1
          and fn.proargtypes[0] = 'pg_catalog.uuid'::pg_catalog.regtype::oid
          and (fn.proargmodes is null or fn.proargmodes = array['i'::"char"])
        )) or (fn.proname = 'release_ai_credit_shadow' and not (
          fn.pronargs = 2
          and fn.proargtypes[0] = 'pg_catalog.uuid'::pg_catalog.regtype::oid
          and fn.proargtypes[1] = 'pg_catalog.text'::pg_catalog.regtype::oid
          and (fn.proargmodes is null or fn.proargmodes = array['i'::"char", 'i'::"char"])
        )) then
      raise exception 'PRECHECK: incompatible % overload', fn.proname;
    end if;
    if fn.proname = 'settle_ai_credit_shadow' then found_settle := true; end if;
    if fn.proname = 'release_ai_credit_shadow' then found_release := true; end if;
  end loop;

  if not found_settle or not found_release then
    raise exception 'PRECHECK: exact terminal settlement RPC contracts are required';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'reconcile_ai_credit_shadow_terminal'
  ) then
    raise exception 'PRECHECK: reconcile_ai_credit_shadow_terminal already exists';
  end if;
end
$$;

create function public.reconcile_ai_credit_shadow_terminal(p_batch_size integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate record;
  result jsonb;
  processed integer := 0;
  settled integer := 0;
  released integer := 0;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 500 then
    raise exception using errcode = 'P0001', message = 'AI_CREDIT_INVALID_TERMINAL_RECONCILIATION_BATCH';
  end if;

  for candidate in
    select l.id as ledger_id, r.id as reservation_id, l.status
    from public.ai_usage_ledger l
    join public.ai_credit_reservations r
      on r.ai_usage_ledger_id = l.id
     and r.state = 'reserved'
    where l.status in ('success', 'failure')
    order by l.id, r.id
    limit p_batch_size
    for update of l skip locked
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        (select student_id from public.ai_usage_ledger where id = candidate.ledger_id),
        119
      )
    );

    if candidate.status = 'failure' then
      result := public.release_ai_credit_shadow(candidate.reservation_id, 'terminal_reconciliation');
      if result->>'state' = 'released' then released := released + 1; end if;
    else
      result := public.settle_ai_credit_shadow(candidate.reservation_id);
      if result->>'state' = 'settled' then settled := settled + 1;
      elsif result->>'state' = 'released' then released := released + 1;
      end if;
    end if;
    processed := processed + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'processed', processed,
    'settled', settled,
    'released', released
  );
end
$$;

revoke all on function public.reconcile_ai_credit_shadow_terminal(integer)
  from public, anon, authenticated;
grant execute on function public.reconcile_ai_credit_shadow_terminal(integer)
  to service_role;

comment on function public.reconcile_ai_credit_shadow_terminal(integer) is
  'Bounded terminal-only reconciliation; never mutates in-progress provider attempts.';

commit;
