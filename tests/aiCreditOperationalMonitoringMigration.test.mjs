import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL(
  "../supabase/migrations/20260926_ai_credit_operational_monitoring_v1.sql",
  import.meta.url,
), "utf8");
const behaviorSql = await readFile(new URL(
  "./postgres/aiCreditOperationalMonitoring.behavior.sql",
  import.meta.url,
), "utf8");

test("Stage 4 migration is transactional, read-only, inactive, and seed-free", () => {
  assert.match(sql, /^begin;/im);
  assert.match(sql, /^commit;/im);
  assert.doesNotMatch(sql, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i);
  assert.doesNotMatch(sql, /\b(?:perform|call|select)\s+(?:public\.)?reconcile_ai_credit_shadow_terminal\s*\(/i);
  assert.match(sql, /'observational_only',true[\s\S]*'enforcement_active',false/i);
});

test("Stage 4 covers every readiness category and contains no sensitive payload fields", () => {
  for (const category of [
    "terminal_reserved_backlog", "stale_in_progress", "identity_mismatch_or_orphan",
    "settlement_conflict", "excluded_usage", "policy_or_tranche_coverage",
    "expired_period", "expired_tranche",
  ]) assert.match(sql, new RegExp(category, "i"));
  assert.match(sql, /term_exceeded/);
  assert.match(sql, /rolling_5h_near_limit/);
  assert.match(sql, /rolling_24h_exceeded/);
  assert.doesNotMatch(sql, /prompt|provider_response|mobile_number|input_tokens|output_tokens|error_message/i);
});

test("Stage 4 RPC is bounded, deterministic, fixed-path, and service-role-only", () => {
  assert.match(sql, /create function public\.read_ai_credit_operational_monitor\([\s\S]*p_evaluated_at timestamptz[\s\S]*p_limit integer default 100[\s\S]*p_include_identifiers boolean default false/i);
  assert.match(sql, /p_limit < 1 or p_limit > 500/i);
  assert.match(sql, /order by category, observed_at, entity_id limit p_limit/i);
  assert.match(sql, /language plpgsql\s+stable\s+security definer\s+set search_path = pg_catalog, public/i);
  assert.match(sql, /revoke all on function public\.read_ai_credit_operational_monitor\(timestamptz,integer,interval,integer,boolean\)[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.read_ai_credit_operational_monitor\(timestamptz,integer,interval,integer,boolean\)[\s\S]*to service_role/i);
});

test("Stage 4 behavior uses dedicated fixtures and separates full coverage from truncation", () => {
  assert.doesNotMatch(behaviorSql, /\\ir\s+aiCreditShadowLimits\.behavior\.sql/i);
  assert.match(behaviorSql, /Dedicated Stage 4 fixtures/i);
  assert.match(behaviorSql, /read_ai_credit_operational_monitor\('2026-06-15T12:00Z',500/i);
  assert.match(behaviorSql, /read_ai_credit_operational_monitor\('2026-06-15T12:00Z',3/i);
  assert.match(behaviorSql, /jsonb_array_length\(bounded->'findings'\)<>3/i);
  assert.match(behaviorSql, /detailed finding missing/i);
});
