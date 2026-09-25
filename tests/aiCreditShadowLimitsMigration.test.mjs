import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL(
  "../supabase/migrations/20260925_ai_credit_shadow_limit_reporting_v1.sql",
  import.meta.url,
), "utf8");
const behaviorSql = await readFile(new URL(
  "./postgres/aiCreditShadowLimits.behavior.sql",
  import.meta.url,
), "utf8");

test("Stage 3 migration is transactional, observational, and seed-free", () => {
  assert.match(sql, /^begin;/im);
  assert.match(sql, /^commit;/im);
  assert.doesNotMatch(sql, /insert\s+into/i);
  assert.doesNotMatch(sql, /update\s+public\.|delete\s+from|is_active\s*=\s*true/i);
  assert.doesNotMatch(sql, /raise exception[^;]*(?:exceeded|balance|limit)/i);
  assert.match(sql, /'observational_only', true/i);
});

test("Stage 3 counts only authoritative terminal debit artifacts", () => {
  assert.match(sql, /t\.transaction_type = 'debit'/i);
  assert.match(sql, /r\.state = 'settled'/i);
  assert.match(sql, /u\.status = 'success'/i);
  assert.match(sql, /u\.pricing_status = 'priced'/i);
  assert.match(sql, /authoritative_billing/i);
  assert.match(sql, /u\.metadata->'client_reported' = 'false'::jsonb/i);
});

test("Stage 3 uses exact half-open rolling windows and entitlement isolation", () => {
  assert.match(sql, /t\.created_at > p_at - interval '5 hours'/i);
  assert.match(sql, /t\.created_at > p_at - interval '24 hours'/i);
  assert.match(sql, /t\.created_at <= p_at/i);
  assert.match(sql, /t\.created_at >= entitlement_row\.source_period_start/i);
  assert.match(sql, /t\.created_at < entitlement_row\.source_period_end/i);
  assert.match(sql, /g\.available_at <= p_at and g\.expires_at > p_at/i);
});

test("Stage 3 RPC is exact, stable, fixed-path, and service-role-only", () => {
  assert.match(sql, /create function public\.read_ai_credit_usage_shadow\(\s*p_student_id text, p_entitlement_period_id uuid, p_at timestamptz\s*\)/i);
  assert.match(sql, /language plpgsql\s+stable\s+security definer\s+set search_path = pg_catalog, public/i);
  assert.match(sql, /revoke all on function public\.read_ai_credit_usage_shadow\(text, uuid, timestamptz\)\s+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.read_ai_credit_usage_shadow\(text, uuid, timestamptz\)\s+to service_role/i);
});

test("Stage 3 ACL fixture checks PUBLIC through the ACL pseudo-role", () => {
  assert.doesNotMatch(behaviorSql, /has_function_privilege\(\s*'PUBLIC'/i);
  assert.match(behaviorSql, /aclexplode\(coalesce\(p\.proacl, acldefault\('f', p\.proowner\)\)\)/i);
  assert.match(behaviorSql, /privilege\.grantee = 0/i);
  assert.match(behaviorSql, /privilege\.privilege_type = 'EXECUTE'/i);
});
