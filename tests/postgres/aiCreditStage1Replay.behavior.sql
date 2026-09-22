\set ON_ERROR_STOP on

create role service_role;
create role anon;
create role authenticated;
\ir ../../supabase/migrations/20260912_ai_usage_ledger_v1.sql
