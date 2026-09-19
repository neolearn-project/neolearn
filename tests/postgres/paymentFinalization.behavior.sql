\set ON_ERROR_STOP on

-- This harness is for a disposable empty PostgreSQL/Supabase-compatible database only.
-- Container destruction, rather than a wrapping transaction, is the cleanup boundary.
create role service_role;
create role anon;
create role authenticated;
create table public.plans (id bigserial primary key, code text unique, name text, track text,
  price numeric(12,2), validity_days integer, is_active boolean);
create table public.student_payments (id bigserial primary key, student_mobile text, plan_code text,
  amount numeric(12,2), currency text, payment_status text, razorpay_order_id text,
  razorpay_payment_id text, razorpay_signature text, source text, notes jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table public.student_subscriptions (id bigserial primary key, student_mobile text, plan_code text,
  payment_status text, is_active boolean, start_at timestamptz, end_at timestamptz,
  created_at timestamptz default now());

\ir ../../supabase/migrations/20260917_atomic_razorpay_finalization.sql

insert into public.plans(code, price, validity_days, is_active) values ('SNAPSHOT', 999, 999, false);
insert into public.student_payments(student_mobile, plan_code, amount, currency, payment_status,
  razorpay_order_id, notes, purchase_validity_days)
values ('9999999999', 'SNAPSHOT', 499.00, 'INR', 'created', 'order_fixture',
  '{"validity_days":30}', 30);
