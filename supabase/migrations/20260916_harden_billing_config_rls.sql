begin;

-- Billing and entitlement/config tables are accessed by server API routes with
-- the Supabase service-role key only. Browser clients must use API routes.
alter table public.student_payments enable row level security;
alter table public.student_subscriptions enable row level security;
alter table public.access_override enable row level security;
alter table public.student_access_policy enable row level security;
alter table public.plans enable row level security;
alter table public.app_settings enable row level security;
alter table public.feature_flags enable row level security;

revoke all privileges on table public.student_payments from anon, authenticated, public;
revoke all privileges on table public.student_subscriptions from anon, authenticated, public;
revoke all privileges on table public.access_override from anon, authenticated, public;
revoke all privileges on table public.student_access_policy from anon, authenticated, public;
revoke all privileges on table public.plans from anon, authenticated, public;
revoke all privileges on table public.app_settings from anon, authenticated, public;
revoke all privileges on table public.feature_flags from anon, authenticated, public;

grant select, insert, update, delete on table public.student_payments to service_role;
grant select, insert, update, delete on table public.student_subscriptions to service_role;
grant select, insert, update, delete on table public.access_override to service_role;
grant select, insert, update, delete on table public.student_access_policy to service_role;
grant select, insert, update, delete on table public.plans to service_role;
grant select, insert, update, delete on table public.app_settings to service_role;
grant select, insert, update, delete on table public.feature_flags to service_role;

comment on table public.student_payments is
  'NeoLearn billing table. Server-service-role only; browser clients must use API routes.';
comment on table public.student_subscriptions is
  'NeoLearn subscription table. Server-service-role only; browser clients must use API routes.';
comment on table public.access_override is
  'NeoLearn access override table. Server-service-role only; browser clients must use API routes.';
comment on table public.student_access_policy is
  'NeoLearn per-student access policy table. Server-service-role only; browser clients must use API routes.';
comment on table public.plans is
  'NeoLearn plan catalog table. Server-service-role only; browser clients must use API routes.';
comment on table public.app_settings is
  'NeoLearn application settings table. Server-service-role only; browser clients must use API routes.';
comment on table public.feature_flags is
  'NeoLearn feature flag table. Server-service-role only; browser clients must use API routes.';

-- Related id sequences, when present, are also server-service-role only.
-- Missing sequences are skipped so the migration stays compatible with
-- schemas that use identity columns, UUIDs, or differently provisioned tables.
do $$
declare
  seq_name text;
  seq_reg regclass;
begin
  foreach seq_name in array array[
    'public.access_override_id_seq',
    'public.plans_id_seq',
    'public.student_subscriptions_id_seq'
  ]
  loop
    seq_reg := to_regclass(seq_name);
    if seq_reg is not null then
      execute format('revoke all privileges on sequence %s from anon, authenticated, public', seq_reg);
      execute format('grant usage, select, update on sequence %s to service_role', seq_reg);
    end if;
  end loop;
end
$$;

commit;
