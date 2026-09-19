\set ON_ERROR_STOP on

create role service_role;
create role anon;
create role authenticated;

\ir ../../supabase/migrations/20260912_ai_usage_ledger_v1.sql
\ir ../../supabase/migrations/20260919_ai_credit_shadow_persistence_v1.sql

insert into public.ai_credit_config (
  config_version, fx_rate_version, formula_version, usage_price_version,
  fx_paise_per_usd, fx_safety_bps, markup_bps, credit_paise,
  action_minimum_credits, monthly_grant_credits, effective_from, is_active
) values (
  'cfg-v1', 'fx-v1', 'ai-credit-v1-final-ceil', 'openai-test-v1',
  8300, 10000, 10000, 100,
  '{"teacher_qa":"5","realtime":"7","tts":"3","large":"1"}',
  10, statement_timestamp() - interval '1 day', true
);

insert into public.ai_usage_ledger (
  id, student_id, feature, provider, provider_call, model, request_id,
  idempotency_key, retry_attempt, cost_nano_usd, pricing_status,
  pricing_reason, price_version, status, metadata, started_at, created_at
) values
('00000000-0000-0000-0000-000000000001', 'student:concurrent', 'teacher_qa', 'openai', 'responses.create', 'model', 'req-main', 'req-main:teacher_qa:responses.create:0', 0, 1000000000, 'priced', null, 'openai-test-v1', 'success', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000002', 'student:grant-race', 'teacher_qa', 'openai', 'responses.create', 'model', 'req-grant-a', 'req-grant-a:teacher_qa:responses.create:0', 0, 100, 'priced', null, 'openai-test-v1', 'in_progress', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000003', 'student:grant-race', 'teacher_qa', 'openai', 'responses.create', 'model', 'req-grant-b', 'req-grant-b:teacher_qa:responses.create:0', 0, 100, 'priced', null, 'openai-test-v1', 'in_progress', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000004', 'student:race', 'teacher_qa', 'openai', 'responses.create', 'model', 'req-race', 'req-race:teacher_qa:responses.create:0', 0, 1000000000, 'priced', null, 'openai-test-v1', 'success', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000005', 'student:retry', 'teacher_qa', 'openai', 'responses.create', 'model', 'req-retry', 'req-retry:teacher_qa:responses.create:0', 0, null, 'unknown', 'missing_usage', 'openai-test-v1', 'failure', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000006', 'student:retry', 'teacher_qa', 'openai', 'responses.create', 'model', 'req-retry', 'req-retry:teacher_qa:responses.create:1', 1, 1000000000, 'priced', null, 'openai-test-v1', 'success', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000007', 'student:excluded', 'teacher_qa', 'openai', 'responses.create', 'model', 'req-unknown', 'excluded:unknown:0', 0, null, 'unknown', 'missing_usage', 'openai-test-v1', 'success', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000008', 'student:excluded', 'teacher_qa', 'openai', 'responses.create', 'model', 'req-unpriced', 'excluded:unpriced:0', 0, null, 'unpriced', 'unknown_model', 'openai-test-v1', 'success', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000009', 'student:excluded', 'realtime', 'openai', 'client.reported', 'model', 'req-client', 'excluded:client:0', 0, 1000000000, 'priced', null, 'openai-test-v1', 'success', '{"authoritative_billing":false,"client_reported":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000010', 'student:excluded', 'realtime', 'openai', 'session.setup', 'model', 'req-setup', 'excluded:setup:0', 0, 1000000000, 'priced', null, 'openai-test-v1', 'success', '{"authoritative_billing":false}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000011', 'student:excluded', 'tts', 'openai', 'audio.speech', 'model', 'req-tts', 'excluded:tts:0', 0, null, 'unknown', 'tts_proxy_characters_only', 'openai-test-v1', 'success', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000012', 'student:large', 'large', 'openai', 'responses.create', 'model', 'req-large', 'large:0', 0, 99999999999999999999999999999, 'priced', null, 'openai-test-v1', 'success', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000013', 'student:stale', 'teacher_qa', 'openai', 'responses.create', 'model', 'req-stale', 'stale:0', 0, null, 'unknown', null, 'openai-test-v1', 'in_progress', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000014', 'student:snapshot', 'teacher_qa', 'openai', 'responses.create', 'model', 'req-snapshot', 'snapshot:0', 0, 1000000000, 'priced', null, 'openai-test-v1', 'success', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000015', 'student:flags', 'teacher_qa', 'openai', 'responses.create', 'model', 'req-auth-string', 'flags:auth-string:0', 0, 1000000000, 'priced', null, 'openai-test-v1', 'success', '{"authoritative_billing":"true"}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000016', 'student:flags', 'teacher_qa', 'openai', 'responses.create', 'model', 'req-client-string', 'flags:client-string:0', 0, 1000000000, 'priced', null, 'openai-test-v1', 'success', '{"authoritative_billing":true,"client_reported":"false"}', statement_timestamp(), statement_timestamp()),
('00000000-0000-0000-0000-000000000017', 'student:identity', 'teacher_qa', 'openai', 'responses.create', 'model', 'req-provider', 'identity:provider:0', 0, 1000000000, 'priced', null, 'openai-test-v1', 'success', '{"authoritative_billing":true}', statement_timestamp(), statement_timestamp());
