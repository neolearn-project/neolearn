import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/20260922_ai_credit_plan_policy_v1.sql", import.meta.url), "utf8");

test("Stage 2 migration source lint (not behavioral proof)", () => {
  assert.match(sql, /^begin;/im); assert.match(sql, /^commit;/im);
  assert.match(sql, /is_active boolean not null default false/i);
  assert.doesNotMatch(sql, /insert into public\.ai_credit_plan_policies/i);
  assert.doesNotMatch(sql, /raise exception[^;]*(?:balance|limit exceeded)/i);
});

test("Stage 2 snapshots, trial uniqueness and grant identities are immutable", () => {
  assert.match(sql, /ai_credit_entitlement_trial_once_uidx/i);
  assert.match(sql, /grant_identity text not null unique/i);
  assert.match(sql, /Stage 2 snapshots are immutable/i);
  assert.match(sql, /on conflict \(grant_identity\) do nothing/i);
});

test("Stage 2 RPCs are forced-RLS service-role-only", () => {
  assert.equal((sql.match(/force row level security/gi) || []).length, 3);
  for (const name of ["create_ai_credit_entitlement_shadow", "create_ai_credit_upgrade_shadow", "read_ai_credit_limits_shadow"]) {
    assert.match(sql, new RegExp(`create function public\\.${name}[\\s\\S]+?security definer[\\s\\S]+?set search_path = pg_catalog, public`, "i"));
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}[\\s\\S]+?from public, anon, authenticated`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}[\\s\\S]+?to service_role`, "i"));
  }
});
