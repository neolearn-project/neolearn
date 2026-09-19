begin;

-- Abort before DDL when the unknown production schema is incompatible.
do $$
declare
  payment_id_oid oid;
  linked_id_oid oid;
  bad_count bigint;
  fn record;
begin
  select atttypid into payment_id_oid
  from pg_catalog.pg_attribute
  where attrelid = 'public.student_payments'::pg_catalog.regclass
    and attname = 'id' and attnum > 0 and not attisdropped;
  if payment_id_oid is null then raise exception 'PRECHECK: student_payments.id missing'; end if;

  select atttypid into linked_id_oid
  from pg_catalog.pg_attribute
  where attrelid = 'public.student_subscriptions'::pg_catalog.regclass
    and attname = 'student_payment_id' and attnum > 0 and not attisdropped;
  if linked_id_oid is not null and linked_id_oid <> payment_id_oid then
    raise exception 'PRECHECK: student_payment_id type mismatch';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'finalize_razorpay_student_payment'
      and (p.prorettype <> 'jsonb'::pg_catalog.regtype
        or p.pronargs <> 8
        or p.proargnames is distinct from array[
          'p_order_id','p_payment_id','p_student_mobile','p_plan_code',
          'p_amount_paise','p_currency','p_source','p_payment_signature'
        ]::text[])
  ) then raise exception 'PRECHECK: existing finalize RPC signature differs'; end if;

  if exists (
    select 1 from pg_catalog.pg_attribute a
    join pg_catalog.pg_type t on t.oid = a.atttypid
    where (a.attrelid, a.attname) in (
      ('public.student_payments'::pg_catalog.regclass, 'created_at'),
      ('public.student_payments'::pg_catalog.regclass, 'updated_at'),
      ('public.student_subscriptions'::pg_catalog.regclass, 'start_at'),
      ('public.student_subscriptions'::pg_catalog.regclass, 'end_at'),
      ('public.student_subscriptions'::pg_catalog.regclass, 'created_at')
    ) and t.typname <> 'timestamptz'
  ) or (select count(*) from pg_catalog.pg_attribute a where (a.attrelid, a.attname) in (
      ('public.student_payments'::pg_catalog.regclass, 'created_at'),
      ('public.student_payments'::pg_catalog.regclass, 'updated_at'),
      ('public.student_subscriptions'::pg_catalog.regclass, 'start_at'),
      ('public.student_subscriptions'::pg_catalog.regclass, 'end_at'),
      ('public.student_subscriptions'::pg_catalog.regclass, 'created_at')
    ) and a.attnum > 0 and not a.attisdropped) <> 5 then
    raise exception 'PRECHECK: billing timestamps must all be timestamptz';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_attribute a
    join pg_catalog.pg_type t on t.oid = a.atttypid
    where a.attrelid = 'public.student_payments'::pg_catalog.regclass
      and a.attname = 'amount' and t.typcategory = 'N'
  ) then raise exception 'PRECHECK: student_payments.amount must be numeric'; end if;

  if not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.student_payments'::pg_catalog.regclass
      and a.attname = 'notes' and a.atttypid = 'jsonb'::pg_catalog.regtype
  ) then raise exception 'PRECHECK: student_payments.notes must be jsonb'; end if;

  if exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.student_payments'::pg_catalog.regclass
      and a.attname = 'purchase_validity_days' and a.atttypid <> 'integer'::pg_catalog.regtype
  ) then raise exception 'PRECHECK: purchase_validity_days must be integer'; end if;

  if linked_id_oid is not null then
    execute 'select count(*) from (select student_payment_id from public.student_subscriptions where student_payment_id is not null group by student_payment_id having count(*) > 1) d'
      into bad_count;
    if bad_count > 0 then raise exception 'PRECHECK: duplicate student_payment_id links'; end if;
    execute 'select count(*) from public.student_subscriptions s left join public.student_payments p on p.id = s.student_payment_id where s.student_payment_id is not null and p.id is null'
      into bad_count;
    if bad_count > 0 then raise exception 'PRECHECK: orphan student_payment_id links'; end if;
  end if;

  select count(*) into bad_count from (
    select razorpay_order_id from public.student_payments where razorpay_order_id is not null
    group by razorpay_order_id having count(*) > 1
  ) d;
  if bad_count > 0 then raise exception 'PRECHECK: duplicate Razorpay order ids'; end if;
  select count(*) into bad_count from (
    select razorpay_payment_id from public.student_payments where razorpay_payment_id is not null
    group by razorpay_payment_id having count(*) > 1
  ) d;
  if bad_count > 0 then raise exception 'PRECHECK: duplicate Razorpay payment ids'; end if;

  for fn in
    select p.oid, p.prosecdef, p.proconfig, p.proowner
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'finalize_razorpay_student_payment'
  loop
    if pg_catalog.oidvectortypes((select proargtypes from pg_catalog.pg_proc where oid = fn.oid))
       <> 'text, text, text, text, bigint, text, text, text' then
      raise exception 'PRECHECK: unexpected finalize RPC overload';
    end if;
    if fn.prosecdef is not true or not ('search_path=pg_catalog, public' = any(coalesce(fn.proconfig, array[]::text[]))) then
      raise exception 'PRECHECK: existing finalize RPC security settings differ';
    end if;
    if exists (
      select 1 from pg_catalog.aclexplode(coalesce(
        (select proacl from pg_catalog.pg_proc where oid = fn.oid),
        pg_catalog.acldefault('f', fn.proowner)
      )) x
      where x.privilege_type = 'EXECUTE'
        and x.grantee not in (fn.proowner, coalesce((select oid from pg_catalog.pg_roles where rolname = 'service_role'), 0::oid))
    ) then raise exception 'PRECHECK: existing finalize RPC has unexpected execute ACL'; end if;
  end loop;
end
$$;

-- The billing tables predate the checked-in migrations. Derive the payment
-- primary-key type so this migration remains compatible with bigint or UUID ids.
do $$
declare
  payment_id_type text;
begin
  select pg_catalog.format_type(a.atttypid, a.atttypmod)
    into payment_id_type
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.student_payments'::pg_catalog.regclass
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if payment_id_type is null then
    raise exception 'student_payments.id is required';
  end if;

  execute pg_catalog.format(
    'alter table public.student_subscriptions add column if not exists student_payment_id %s',
    payment_id_type
  );
end
$$;

alter table public.student_payments
  add column if not exists purchase_validity_days integer;

update public.student_payments
set purchase_validity_days = case
  when notes->>'validity_days' ~ '^[1-9][0-9]{0,4}$' then
    case when (notes->>'validity_days')::integer <= 36500
      then (notes->>'validity_days')::integer
      else null
    end
  else null
end
where purchase_validity_days is null
  and payment_status in ('created', 'paid');

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.student_subscriptions'::pg_catalog.regclass
      and c.contype = 'f'
      and c.conkey @> array[(select attnum from pg_catalog.pg_attribute
        where attrelid = c.conrelid and attname = 'student_payment_id')]::smallint[]
      and not (
        c.conname = 'student_subscriptions_student_payment_id_fkey'
        and c.confrelid = 'public.student_payments'::pg_catalog.regclass
        and c.confdeltype = 'r'
        and c.confupdtype = 'a'
        and c.confmatchtype = 's'
        and c.condeferrable is false
        and c.convalidated is true
        and c.conkey = array[(select attnum from pg_catalog.pg_attribute
          where attrelid = c.conrelid and attname = 'student_payment_id')]::smallint[]
        and c.confkey = array[(select attnum from pg_catalog.pg_attribute
          where attrelid = c.confrelid and attname = 'id')]::smallint[]
      )
  ) then raise exception 'PRECHECK: unexpected FK involving student_payment_id'; end if;

  if exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.student_payments'::pg_catalog.regclass
      and conname = 'student_payments_purchase_validity_days_check'
      and pg_catalog.regexp_replace(lower(pg_catalog.pg_get_constraintdef(oid)), '[^a-z0-9]+', '', 'g')
          <> 'checkpurchasevaliditydaysisnullorpurchasevaliditydays0andpurchasevaliditydays36500'
  ) then raise exception 'PRECHECK: validity constraint definition differs'; end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.student_payments'::pg_catalog.regclass
      and conname = 'student_payments_purchase_validity_days_check'
  ) then
    alter table public.student_payments add constraint student_payments_purchase_validity_days_check
      check (purchase_validity_days is null or (purchase_validity_days > 0 and purchase_validity_days <= 36500));
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'student_subscriptions_student_payment_id_fkey'
      and conrelid = 'public.student_subscriptions'::pg_catalog.regclass
  ) and not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conname = 'student_subscriptions_student_payment_id_fkey'
      and c.conrelid = 'public.student_subscriptions'::pg_catalog.regclass
      and c.contype = 'f'
      and c.confrelid = 'public.student_payments'::pg_catalog.regclass
      and c.confdeltype = 'r'
      and c.confupdtype = 'a'
      and c.confmatchtype = 's'
      and c.condeferrable is false
      and c.convalidated is true
      and c.conkey = array[(select attnum from pg_catalog.pg_attribute where attrelid = c.conrelid and attname = 'student_payment_id')]::smallint[]
      and c.confkey = array[(select attnum from pg_catalog.pg_attribute where attrelid = c.confrelid and attname = 'id')]::smallint[]
  ) then raise exception 'PRECHECK: student payment FK definition differs';
  elsif not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'student_subscriptions_student_payment_id_fkey'
      and conrelid = 'public.student_subscriptions'::pg_catalog.regclass
  ) then
    alter table public.student_subscriptions
      add constraint student_subscriptions_student_payment_id_fkey
      foreign key (student_payment_id)
      references public.student_payments(id)
      on delete restrict;
  end if;
end
$$;

do $$
declare
  spec record;
  idx record;
  expected_attnum smallint;
begin
  for spec in select * from (values
    ('student_subscriptions_student_payment_id_uidx', 'public.student_subscriptions'::pg_catalog.regclass, 'student_payment_id'),
    ('student_payments_razorpay_order_id_uidx', 'public.student_payments'::pg_catalog.regclass, 'razorpay_order_id'),
    ('student_payments_razorpay_payment_id_uidx', 'public.student_payments'::pg_catalog.regclass, 'razorpay_payment_id')
  ) v(index_name, table_oid, column_name)
  loop
    select a.attnum into expected_attnum from pg_catalog.pg_attribute a
    where a.attrelid = spec.table_oid and a.attname = spec.column_name;
    select i.indrelid, i.indisunique, i.indnkeyatts, i.indnatts, i.indisvalid, i.indislive,
           am.amname as access_method, i.indkey::smallint[] as keys,
           pg_catalog.regexp_replace(lower(pg_catalog.pg_get_expr(i.indpred, i.indrelid)), '[^a-z0-9]+', '', 'g') as predicate
      into idx
    from pg_catalog.pg_class c join pg_catalog.pg_index i on i.indexrelid = c.oid
    join pg_catalog.pg_am am on am.oid = c.relam
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = spec.index_name;
    if found and (
      idx.indrelid <> spec.table_oid or idx.indisunique is not true or idx.indnkeyatts <> 1
      or idx.indnatts <> 1 or idx.indisvalid is not true or idx.indislive is not true
      or idx.access_method <> 'btree'
      or not (expected_attnum = any(idx.keys))
      or idx.predicate is distinct from (lower(replace(spec.column_name, '_', '')) || 'isnotnull')
    ) then raise exception 'PRECHECK: index % definition differs', spec.index_name; end if;
  end loop;
end
$$;

create unique index if not exists student_subscriptions_student_payment_id_uidx
  on public.student_subscriptions (student_payment_id)
  where student_payment_id is not null;

create unique index if not exists student_payments_razorpay_order_id_uidx
  on public.student_payments (razorpay_order_id)
  where razorpay_order_id is not null;

create unique index if not exists student_payments_razorpay_payment_id_uidx
  on public.student_payments (razorpay_payment_id)
  where razorpay_payment_id is not null;

comment on column public.student_subscriptions.student_payment_id is
  'Unique billing provenance for subscriptions finalized by the Razorpay payment RPC. Legacy subscriptions may be null.';

create or replace function public.finalize_razorpay_student_payment(
  p_order_id text,
  p_payment_id text,
  p_student_mobile text,
  p_plan_code text,
  p_amount_paise bigint,
  p_currency text,
  p_source text,
  p_payment_signature text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  payment_row public.student_payments%rowtype;
  subscription_row public.student_subscriptions%rowtype;
  conflicting_payment_id public.student_payments.id%type;
  activation_start timestamptz;
  activation_end timestamptz;
  was_claimed boolean;
  already_processed boolean := false;
  should_activate boolean;
  recovered boolean := false;
begin
  if coalesce(btrim(p_order_id), '') = ''
     or coalesce(btrim(p_payment_id), '') = ''
     or p_student_mobile is null
     or p_student_mobile !~ '^[0-9]{10}$'
     or coalesce(btrim(p_plan_code), '') = ''
     or p_amount_paise is null
     or p_amount_paise <= 0
     or upper(coalesce(btrim(p_currency), '')) <> 'INR'
     or p_source is null
     or p_source not in ('verify', 'webhook') then
    raise exception using errcode = 'P0001', message = 'PAYMENT_CONFLICT: invalid finalization input';
  end if;

  select *
    into payment_row
  from public.student_payments
  where razorpay_order_id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_FOUND';
  end if;

  if payment_row.student_mobile is null
     or payment_row.student_mobile is distinct from p_student_mobile
     or payment_row.plan_code is null
     or upper(coalesce(payment_row.plan_code, '')) <> upper(p_plan_code)
     or payment_row.amount is null
     or payment_row.amount <= 0
     or (payment_row.amount::numeric * 100) is distinct from p_amount_paise::numeric
     or payment_row.currency is null
     or upper(coalesce(payment_row.currency, '')) <> upper(p_currency)
     or payment_row.purchase_validity_days is null
     or payment_row.purchase_validity_days <= 0
     or payment_row.purchase_validity_days > 36500
     or payment_row.razorpay_order_id is distinct from p_order_id then
    raise exception using errcode = 'P0001', message = 'PAYMENT_CONFLICT: stored payment mismatch';
  end if;

  select id
    into conflicting_payment_id
  from public.student_payments
  where razorpay_payment_id = p_payment_id
    and id <> payment_row.id
  limit 1
  for update;

  if found then
    raise exception using errcode = 'P0001', message = 'PAYMENT_CONFLICT: payment identifier already used';
  end if;

  if payment_row.razorpay_payment_id is not null
     and payment_row.razorpay_payment_id <> p_payment_id then
    raise exception using errcode = 'P0001', message = 'PAYMENT_CONFLICT: payment claim mismatch';
  end if;

  if payment_row.payment_status is null
     or payment_row.payment_status not in ('created', 'paid') then
    raise exception using errcode = 'P0001', message = 'PAYMENT_CONFLICT: payment status is not finalizable';
  end if;

  was_claimed := coalesce(payment_row.razorpay_payment_id = p_payment_id, false);
  recovered := was_claimed;

  -- Serialize separate orders for one student as well as retries for one order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(payment_row.student_mobile, 0));

  if not was_claimed then
    update public.student_payments
    set razorpay_payment_id = p_payment_id,
        razorpay_signature = case
          when p_source = 'verify' then p_payment_signature
          else razorpay_signature
        end,
        source = p_source,
        updated_at = statement_timestamp()
    where id = payment_row.id;

    activation_start := statement_timestamp();
  else
    -- A pre-migration browser attempt may have claimed the payment before a
    -- later statement failed. Reuse its original claim time; never grant a new period.
    activation_start := coalesce(payment_row.updated_at, payment_row.created_at, statement_timestamp());
  end if;

  select *
    into subscription_row
  from public.student_subscriptions
  where student_payment_id = payment_row.id
  for update;

  if not found and was_claimed then
    -- Recover a subscription inserted by the old non-atomic flow. The narrow
    -- time window and exact owner/plan match avoid adopting an unrelated legacy row.
    select *
      into subscription_row
    from public.student_subscriptions
    where student_payment_id is null
      and student_mobile = p_student_mobile
      and upper(plan_code) = upper(p_plan_code)
      and payment_status = 'paid'
      and start_at between activation_start - interval '5 minutes'
                       and activation_start + interval '5 minutes'
    order by start_at asc, id asc
    limit 1
    for update;

    if found then
      recovered := true;
      update public.student_subscriptions
      set student_payment_id = payment_row.id
      where id = subscription_row.id
      returning * into subscription_row;
    end if;
  end if;

  if payment_row.payment_status = 'paid' and subscription_row.id is null then
    raise exception using errcode = 'P0001', message = 'PAYMENT_CONFLICT: paid payment has no recoverable subscription';
  end if;

  if subscription_row.id is null then
    activation_end := activation_start + pg_catalog.make_interval(days => payment_row.purchase_validity_days);

    insert into public.student_subscriptions (
      student_mobile,
      plan_code,
      payment_status,
      is_active,
      start_at,
      end_at,
      created_at,
      student_payment_id
    ) values (
      payment_row.student_mobile,
      payment_row.plan_code,
      'paid',
      true,
      activation_start,
      activation_end,
      activation_start,
      payment_row.id
    )
    returning * into subscription_row;
  else
    already_processed := payment_row.payment_status = 'paid';
    activation_start := subscription_row.start_at;
    activation_end := subscription_row.end_at;

    if subscription_row.student_mobile is distinct from p_student_mobile
       or upper(coalesce(subscription_row.plan_code, '')) <> upper(p_plan_code)
       or subscription_row.payment_status is distinct from 'paid' then
      raise exception using errcode = 'P0001', message = 'PAYMENT_CONFLICT: subscription mismatch';
    end if;

    -- A duplicate for a completed older payment is a true no-op. In particular,
    -- it must not reactivate this subscription over a newer purchase.
    if already_processed then
      return pg_catalog.jsonb_build_object(
        'ok', true,
        'already_processed', true,
        'subscription_id', subscription_row.id,
        'student_mobile', subscription_row.student_mobile,
        'plan_code', subscription_row.plan_code,
        'start_at', subscription_row.start_at,
        'end_at', subscription_row.end_at,
        'is_active', subscription_row.is_active,
        'recovered', true
      );
    end if;
  end if;

  should_activate := subscription_row.start_at <= statement_timestamp()
    and subscription_row.end_at > statement_timestamp();

  if should_activate and not already_processed and exists (
    select 1 from public.student_subscriptions newer
    where newer.student_mobile = payment_row.student_mobile
      and newer.is_active is true
      and newer.id <> subscription_row.id
      and (
        newer.start_at > subscription_row.start_at
        or newer.created_at > payment_row.created_at
      )
  ) then
    should_activate := false;
  end if;

  if should_activate then
    update public.student_subscriptions
    set is_active = false
    where student_mobile = p_student_mobile
      and is_active = true
      and id <> subscription_row.id;
  end if;

  update public.student_subscriptions
  set is_active = should_activate,
      payment_status = 'paid'
  where id = subscription_row.id
  returning * into subscription_row;

  update public.student_payments
  set razorpay_payment_id = p_payment_id,
      razorpay_signature = case
        when p_source = 'verify' and razorpay_signature is null then p_payment_signature
        else razorpay_signature
      end,
      payment_status = 'paid',
      source = p_source,
      updated_at = statement_timestamp()
  where id = payment_row.id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'already_processed', already_processed,
    'subscription_id', subscription_row.id,
    'student_mobile', subscription_row.student_mobile,
    'plan_code', subscription_row.plan_code,
    'start_at', subscription_row.start_at,
    'end_at', subscription_row.end_at,
    'is_active', subscription_row.is_active,
    'recovered', recovered,
    'already_processed', already_processed
  );
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'PAYMENT_CONFLICT: identifier already finalized';
end;
$$;

revoke all on function public.finalize_razorpay_student_payment(text, text, text, text, bigint, text, text, text) from public;
revoke all on function public.finalize_razorpay_student_payment(text, text, text, text, bigint, text, text, text) from anon;
revoke all on function public.finalize_razorpay_student_payment(text, text, text, text, bigint, text, text, text) from authenticated;
grant execute on function public.finalize_razorpay_student_payment(text, text, text, text, bigint, text, text, text) to service_role;

commit;
