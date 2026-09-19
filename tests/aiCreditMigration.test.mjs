import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../supabase/migrations/20260919_ai_credit_shadow_persistence_v1.sql", import.meta.url),
  "utf8"
);

test("migration is transactional and creates only the four shadow tables", () => {
  assert.match(sql, /^begin;/im);
  assert.match(sql, /^commit;/im);
  for (const table of ["config", "accounts", "reservations", "transactions"]) {
    assert.match(sql, new RegExp(`create table public\\.ai_credit_${table}\\b`, "i"));
  }
  assert.doesNotMatch(sql, /references\s+(?:public\.)?(?:students|plans|student_payments|student_subscriptions|auth\.users)/i);
});

test("catalog preflight fixes identity to the existing ledger contract", () => {
  assert.match(sql, /PRECHECK: public\.ai_usage_ledger is required/i);
  assert.match(sql, /\('id', 'uuid'\)/i);
  assert.match(sql, /\('student_id', 'text'\)/i);
  assert.match(sql, /\('provider_call', 'text'\)/i);
  assert.match(sql, /required Supabase roles are missing/i);
  assert.match(sql, /migration owner must bypass forced RLS/i);
  assert.match(sql, /existing AI credit object requires explicit compatibility review/i);
  assert.match(sql, /ai_usage_ledger_id uuid not null unique references public\.ai_usage_ledger\(id\)/i);
});

test("RPCs are service-role-only security definers with fixed search paths", () => {
  for (const name of ["reserve", "settle", "release"]) {
    assert.match(sql, new RegExp(`create function public\\.${name}_ai_credit_shadow[\\s\\S]+?security definer[\\s\\S]+?set search_path = pg_catalog, public`, "i"));
  }
  assert.match(sql, /revoke all on function public\.reserve_ai_credit_shadow[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.settle_ai_credit_shadow\(uuid\) to service_role/i);
});

test("shadow mode has no balance enforcement and snapshots every charge input", () => {
  assert.match(sql, /reserved_credits = reserved_credits \+ minimum_credits/i);
  assert.match(sql, /debited_credits = debited_credits \+ final_charge/i);
  assert.doesNotMatch(sql, /debited_credits\s*\+[^;]+<=\s*grant_credits/i);
  for (const field of ["usage_price_version", "fx_rate_version", "config_version",
    "formula_version", "fx_paise_per_usd", "fx_safety_bps", "markup_bps",
    "credit_paise", "action_minimum_credits"]) {
    assert.match(sql, new RegExp(field, "i"));
  }
});

test("settlement uses locked authoritative usage and excludes unsafe billing", () => {
  assert.match(sql, /from public\.ai_usage_ledger[\s\S]+for update/i);
  assert.match(sql, /usage_row\.status <> 'success'/i);
  assert.match(sql, /usage_row\.pricing_status = 'unknown'/i);
  assert.match(sql, /usage_row\.pricing_status = 'unpriced'/i);
  assert.match(sql, /metadata->'authoritative_billing'/i);
  assert.match(sql, /metadata->'client_reported'/i);
  assert.match(sql, /usage_row\.price_version is distinct from reservation_row\.usage_price_version/i);
  assert.match(sql, /usage_row\.provider_call is distinct from reservation_row\.provider_call/i);
  assert.match(sql, /jsonb_typeof\(usage_row\.metadata->'authoritative_billing'\)/i);
});

test("action minimum JSON is bounded before every numeric cast", () => {
  assert.match(sql, /create function public\.validate_ai_credit_action_minimums/i);
  assert.match(sql, /jsonb_typeof\(entry\.value\) <> 'string'/i);
  assert.match(sql, /length\(value_text\) > 30/i);
  assert.match(sql, /AI_CREDIT_ACTION_MINIMUM_INVALID/i);
});

test("TTL, terminal states, RLS and append-only rules are explicit", () => {
  assert.match(sql, /p_ttl_seconds not between 300 and 86400/i);
  assert.match(sql, /usage_row\.status = 'in_progress'[\s\S]+state', 'reserved'/i);
  assert.match(sql, /reservation_row\.state = 'released'[\s\S]+already_processed/i);
  assert.match(sql, /force row level security/gi);
  assert.match(sql, /ai_credit_transactions is append-only/i);
});
