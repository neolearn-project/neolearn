import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createStudentAiCreditHandler, studentSafeCreditReport } from "../app/lib/studentAiCreditVisibility.mjs";

const routeSource = await readFile(new URL("../app/api/student/ai-credits/route.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/student/ai-credits/page.tsx", import.meta.url), "utf8");
const studentSource = await readFile(new URL("../app/student/page.tsx", import.meta.url), "utf8");
const roadmap = await readFile(new URL("../docs/ai-credit-limits-roadmap.md", import.meta.url), "utf8");

function database({ entitlement, report, entitlementError = null, rpcError = null }) {
  const calls = [];
  const query = {
    select(value) { calls.push(["select", value]); return this; },
    eq(key, value) { calls.push(["eq", key, value]); return this; },
    lte(key, value) { calls.push(["lte", key, value]); return this; },
    gt(key, value) { calls.push(["gt", key, value]); return this; },
    order(key, value) { calls.push(["order", key, value]); return this; },
    limit(value) { calls.push(["limit", value]); return this; },
    async maybeSingle() { return { data: entitlement, error: entitlementError }; },
  };
  return {
    calls,
    from(table) { calls.push(["from", table]); return query; },
    async rpc(name, args) { calls.push(["rpc", name, args]); return { data: report, error: rpcError }; },
  };
}

const entitlement = { id: "30000000-0000-0000-0000-000000000001", plan_code: "REGULAR", source_period_end: "2026-10-01T00:00:00Z" };
const rawReport = {
  observational_only: true, student_id: "10000000-0000-0000-0000-000000000001",
  entitlement_period_id: entitlement.id, entitlement_identity: "secret-entitlement",
  policy_id: "20000000-0000-0000-0000-000000000001", policy_version: "secret-policy",
  plan_code: entitlement.plan_code, period_start: "2026-09-01T00:00:00Z",
  period_end: entitlement.source_period_end, evaluated_at: "2026-09-26T12:00:00.000Z",
  term: { grant: 100, consumed: 40, remaining: 60, exceeded: false },
  rolling_5h: { grant: 20, consumed: 21, remaining: -1, exceeded: true },
  rolling_24h: { grant: 50, consumed: 30, remaining: 20, exceeded: false },
};

test("Stage 5 requires authenticated student identity before database access", async () => {
  let touched = false;
  const handler = createStudentAiCreditHandler({ requireStudentIdentity: async () => {
    const error = new Error("invalid token"); error.status = 401; throw error;
  }});
  const response = await handler(new Request("http://local/api/student/ai-credits?student_id=attacker"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "Authentication required." });
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(touched, false);
});

test("Stage 5 derives ownership, period and evaluation time on the server", async () => {
  const db = database({ entitlement, report: rawReport });
  const handler = createStudentAiCreditHandler({
    requireStudentIdentity: async () => ({ user: { id: rawReport.student_id }, admin: db }),
    now: () => new Date(rawReport.evaluated_at),
  });
  const response = await handler(new Request("http://local/api/student/ai-credits?student_id=attacker&p_at=2099-01-01"));
  assert.equal(response.status, 200);
  const rpc = db.calls.find(([name]) => name === "rpc");
  assert.deepEqual(rpc, ["rpc", "read_ai_credit_usage_shadow", {
    p_student_id: rawReport.student_id,
    p_entitlement_period_id: entitlement.id,
    p_at: rawReport.evaluated_at,
  }]);
  assert.ok(db.calls.some((call) => call[0] === "limit" && call[1] === 1));
});

test("Stage 5 response is strictly allowlisted and observational", async () => {
  const safe = studentSafeCreditReport(rawReport, {
    studentId: rawReport.student_id, entitlementPeriodId: entitlement.id,
    planCode: entitlement.plan_code, periodEnd: entitlement.source_period_end,
  });
  assert.deepEqual(Object.keys(safe).sort(), ["available", "evaluatedAt", "observationalOnly", "ok", "periodEnd", "rolling24h", "rolling5h", "term"].sort());
  assert.equal(safe.term.grant, "100");
  assert.equal(safe.rolling5h.remaining, "-1");
  const serialized = JSON.stringify(safe);
  for (const forbidden of ["student_id", "entitlement_period_id", "entitlement_identity", "policy_id", "policy_version", "plan_code", "period_start", "secret-"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
});

test("Stage 5 safely handles absent or unavailable reporting", async () => {
  for (const db of [database({ entitlement: null, report: null }), database({ entitlement: null, report: null, entitlementError: { message: "relation missing secret" } })]) {
    const handler = createStudentAiCreditHandler({ requireStudentIdentity: async () => ({ user: { id: rawReport.student_id }, admin: db }) });
    const response = await handler(new Request("http://local/api/student/ai-credits"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, available: false, observationalOnly: true, message: "AI credit reporting is not available for this account." });
  }
});

test("Stage 5 API and UI remain server-only, no-store, and non-enforcing", () => {
  assert.match(routeSource, /requireStudentIdentity/);
  assert.match(routeSource, /createStudentAiCreditHandler/);
  assert.doesNotMatch(routeSource + pageSource, /read_ai_credit_operational_monitor|service_role|SUPABASE_SERVICE/);
  assert.match(pageSource, /fetch\("\/api\/student\/ai-credits", \{ cache: "no-store", headers: studentAuthHeaders\(\) \}\)/);
  assert.match(pageSource, /Refresh/);
  assert.match(pageSource, /Observational only/);
  assert.doesNotMatch(pageSource, /method:\s*["'](?:POST|PUT|PATCH|DELETE)|reset|override|purchase|settle|release/i);
  assert.match(studentSource, /router\.push\("\/student\/ai-credits"\)/);
  assert.match(roadmap, /### Stage 5 completion[\s\S]*completed on 2026-09-26/);
});
