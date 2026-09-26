import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAdminAiCreditMonitorHandler, parseAdminMonitorQuery, safeAdminMonitorReport } from "../app/lib/adminAiCreditMonitoring.mjs";

const route = await readFile(new URL("../app/api/admin/ai-credit-monitoring/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/admin/ai-credit-monitoring/page.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/admin/layout.tsx", import.meta.url), "utf8");
const roadmap = await readFile(new URL("../docs/ai-credit-limits-roadmap.md", import.meta.url), "utf8");

const options = { limit: 100, staleMinutes: 60, nearLimitBps: 9000, includeIdentifiers: false };
const counts = (keys) => Object.fromEntries(keys.map((key) => [key, 0]));
const raw = {
  observational_only: true, enforcement_active: false, evaluated_at: "2026-09-26T12:00:00Z",
  limit: 100, stale_after_seconds: 3600, near_limit_bps: 9000, identifiers_included: false,
  category_counts: counts(["terminal_reserved_backlog","stale_in_progress","identity_mismatch_or_orphan","settlement_conflict","excluded_usage","policy_or_tranche_coverage","expired_period","expired_tranche"]),
  exclusion_counts: counts(["unknown_pricing","unpriced","non_authoritative","non_billable_client_reported","non_billable_excluded","non_terminal_or_failed"]),
  shadow_usage: counts(["active_entitlement_periods","term_consumed","rolling_5h_consumed","rolling_24h_consumed","term_exceeded","term_near_limit","rolling_5h_exceeded","rolling_5h_near_limit","rolling_24h_exceeded","rolling_24h_near_limit"]),
  latest_timestamps: { latest_ledger_created_at:null,latest_terminal_ledger_at:null,latest_reservation_updated_at:null,latest_transaction_at:null,latest_entitlement_period_start:null,latest_reconciliation_backlog_at:null },
  findings: [{ category: "stale_in_progress", observed_at: "2026-09-26T10:00:00Z", details: { secret: "provider payload" } }],
  student_id: "secret-student", phone: "9999999999", email: "secret@example.com", sql: "select secret",
};

test("Stage 6 denies unauthenticated and non-admin requests before database access", async () => {
  for (const authorization of [false, false]) {
    let databaseTouched = false;
    const handler = createAdminAiCreditMonitorHandler({ authorizeAdmin: () => authorization,
      getDatabase: () => { databaseTouched = true; throw new Error("must not run"); } });
    const response = await handler(new Request("http://local/api/admin/ai-credit-monitoring"));
    assert.equal(response.status, 401);
    assert.equal(databaseTouched, false);
    assert.deepEqual(await response.json(), { ok: false, error: "Unauthorized." });
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
});

test("Stage 6 validates and bounds every browser query control", () => {
  assert.deepEqual(parseAdminMonitorQuery("http://local/path"), options);
  assert.deepEqual(parseAdminMonitorQuery("http://local/path?limit=3&staleMinutes=1&nearLimitBps=10000&includeIdentifiers=true"),
    { limit:3, staleMinutes:1, nearLimitBps:10000, includeIdentifiers:true });
  for (const query of ["limit=0","limit=501","limit=1.5","staleMinutes=0","staleMinutes=43201","nearLimitBps=0","nearLimitBps=10001","includeIdentifiers=yes"])
    assert.throws(() => parseAdminMonitorQuery(`http://local/path?${query}`));
});

test("Stage 6 calls only the Stage 4 RPC with server evaluation time and bounded inputs", async () => {
  const calls = [];
  const handler = createAdminAiCreditMonitorHandler({ authorizeAdmin: () => true,
    getDatabase: () => ({ rpc: async (name,args) => { calls.push([name,args]); return { data:raw,error:null }; } }),
    now: () => new Date(raw.evaluated_at) });
  const response = await handler(new Request("http://local/path?limit=100&staleMinutes=60&nearLimitBps=9000"));
  assert.equal(response.status,200);
  assert.deepEqual(calls, [["read_ai_credit_operational_monitor", { p_evaluated_at:new Date(raw.evaluated_at).toISOString(),
    p_limit:100,p_stale_after:"60 minutes",p_near_limit_bps:9000,p_include_identifiers:false }]]);
});

test("Stage 6 redacts by default and permits UUIDs only by explicit opt-in", () => {
  const safe = safeAdminMonitorReport(raw, options);
  const serialized = JSON.stringify(safe);
  for (const secret of ["secret-student","9999999999","secret@example.com","select secret","provider payload","details","student_id","phone","email","sql"])
    assert.doesNotMatch(serialized,new RegExp(secret));
  assert.equal("entityId" in safe.findings[0],false);
  const withIds = safeAdminMonitorReport({ ...raw, identifiers_included:true,
    findings:[{ ...raw.findings[0],entity_id:"60000000-0000-4000-8000-000000000001" }] }, { ...options,includeIdentifiers:true });
  assert.equal(withIds.findings[0].entityId,"60000000-0000-4000-8000-000000000001");
  assert.throws(() => safeAdminMonitorReport({ ...raw,identifiers_included:true,
    findings:[{ ...raw.findings[0],entity_id:"not-a-uuid" }] },{ ...options,includeIdentifiers:true }));
});

test("Stage 6 returns generic no-store errors and performs no mutation", async () => {
  const handler = createAdminAiCreditMonitorHandler({ authorizeAdmin:()=>true,
    getDatabase:()=>({ rpc:async()=>({ data:null,error:{ message:"database secret" } }) }) });
  const response=await handler(new Request("http://local/path"));
  assert.equal(response.status,503); assert.match(response.headers.get("cache-control"),/no-store/);
  assert.deepEqual(await response.json(),{ ok:false,error:"AI credit monitoring is temporarily unavailable." });
  assert.doesNotMatch(route+page,/reconcile_ai_credit|settle_ai_credit|release_ai_credit|reserve_ai_credit|insert\s*\(|update\s*\(|delete\s*\(/i);
});

test("Stage 6 API and UI follow canonical admin and read-only patterns", () => {
  assert.match(route,/x-admin-password/); assert.match(route,/process\.env\.ADMIN_PASSWORD/);
  assert.match(route,/authorizeAdmin, getDatabase: supabaseAdmin/);
  assert.match(page,/cache: "no-store"/); assert.match(page,/Include internal UUIDs/);
  for (const control of ["Refresh","Result limit","Stale minutes","Near-limit bps"]) assert.match(page,new RegExp(control));
  assert.match(page,/No findings for this evaluation/); assert.match(page,/Authenticate and refresh to load monitoring/);
  assert.match(layout,/href="\/admin\/ai-credit-monitoring"/);
  assert.match(roadmap,/Current status: Stage 6 in progress \(2026-09-26\)/);
});
