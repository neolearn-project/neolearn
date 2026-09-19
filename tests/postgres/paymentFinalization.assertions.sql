\set ON_ERROR_STOP on

do $$
declare
  linked public.student_subscriptions%rowtype;
  rejected boolean;
  recovered_payment_id bigint;
  recovered_subscription_id bigint;
  newer_subscription_id bigint;
  recovered_start timestamptz;
  recovered_end timestamptz;
begin
  if (select count(*) from public.student_subscriptions where student_payment_id = 1) <> 1 then
    raise exception 'payment must have exactly one linked subscription';
  end if;
  select * into strict linked from public.student_subscriptions where student_payment_id = 1;
  if linked.end_at <> linked.start_at + interval '30 days' then
    raise exception 'subscription period changed from immutable validity';
  end if;
  if (select count(*) from public.student_payments where id = 1 and payment_status = 'paid'
      and razorpay_payment_id = 'pay_fixture') <> 1 then
    raise exception 'payment was not paid exactly once';
  end if;
  if exists (select 1 from public.student_subscriptions
      where student_payment_id = 1 and id <> linked.id) then
    raise exception 'duplicate or conflicting payment link exists';
  end if;

  rejected := false;
  begin
    perform public.finalize_razorpay_student_payment('order_fixture', 'pay_fixture', '8888888888',
      'SNAPSHOT', 49900, 'INR', 'webhook', null);
  exception when sqlstate 'P0001' then rejected := true;
  end;
  if not rejected then raise exception 'ownership conflict was not rejected'; end if;

  rejected := false;
  begin
    perform public.finalize_razorpay_student_payment('order_fixture', 'pay_fixture', '9999999999',
      'SNAPSHOT', 50000, 'INR', 'webhook', null);
  exception when sqlstate 'P0001' then rejected := true;
  end;
  if not rejected then raise exception 'provider amount conflict was not rejected'; end if;

  insert into public.student_payments(student_mobile, plan_code, amount, currency, payment_status,
    razorpay_order_id, notes, purchase_validity_days)
  values ('9999999999', 'SNAPSHOT', 499.00, 'INR', 'created', 'order_collision', '{}', 30);
  rejected := false;
  begin
    perform public.finalize_razorpay_student_payment('order_collision', 'pay_fixture', '9999999999',
      'SNAPSHOT', 49900, 'INR', 'webhook', null);
  exception when sqlstate 'P0001' then rejected := true;
  end;
  if not rejected then raise exception 'reused payment id was not rejected'; end if;

  insert into public.student_payments(student_mobile, plan_code, amount, currency, payment_status,
    razorpay_order_id, razorpay_payment_id, notes, purchase_validity_days, created_at, updated_at)
  values ('9999999999', 'SNAPSHOT', 499.00, 'INR', 'created', 'order_partial', 'pay_partial',
    '{"validity_days":30}', 30, statement_timestamp() - interval '10 days',
    statement_timestamp() - interval '1 day') returning id into recovered_payment_id;
  insert into public.student_subscriptions(student_mobile, plan_code, payment_status, is_active,
    start_at, end_at, created_at)
  values ('9999999999', 'SNAPSHOT', 'paid', false, statement_timestamp() - interval '1 day',
    statement_timestamp() + interval '29 days', statement_timestamp() - interval '1 day')
  returning id, start_at, end_at into recovered_subscription_id, recovered_start, recovered_end;
  insert into public.student_subscriptions(student_mobile, plan_code, payment_status, is_active,
    start_at, end_at, created_at)
  values ('9999999999', 'SNAPSHOT', 'paid', true, statement_timestamp() - interval '1 hour',
    statement_timestamp() + interval '30 days', statement_timestamp() - interval '1 hour')
  returning id into newer_subscription_id;

  perform public.finalize_razorpay_student_payment('order_partial', 'pay_partial', '9999999999',
    'SNAPSHOT', 49900, 'INR', 'webhook', null);
  if (select count(*) from public.student_subscriptions
      where student_payment_id = recovered_payment_id) <> 1 then
    raise exception 'partial recovery did not create one unique link';
  end if;
  if (select start_at <> recovered_start or end_at <> recovered_end
      from public.student_subscriptions where id = recovered_subscription_id) then
    raise exception 'partial recovery changed the original subscription period';
  end if;
  if (select is_active from public.student_subscriptions where id = newer_subscription_id) is not true then
    raise exception 'older recovered payment deactivated newer access';
  end if;
end
$$;
