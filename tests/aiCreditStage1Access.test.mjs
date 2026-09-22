import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { isPaidSubscriptionActive } from "../lib/access/subscriptionPeriod.mjs";

function dbFor(rows) {
  return { from(table) {
    const query = {
      select() { return query; }, eq() { return query; }, lte() { return query; }, gt() { return query; },
      order() { return query; }, limit() { return query; },
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      then(resolve) { return Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve); },
    };
    return query;
  } };
}

test("AI entitlement helper enforces paid periods, overrides, free limits and flags", async () => {
  const rows = {
    topic_progress: Array.from({ length: 5 }, (_, i) => ({ topic_id: String(i) })),
    app_settings: { value: 5 },
  };
  class OwnershipError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const policySource = await readFile(new URL("../lib/access/checkPolicy.ts", import.meta.url), "utf8");
  const policyJs = ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { computeAccessSummary } = await import(`data:text/javascript;base64,${Buffer.from(policyJs).toString("base64")}`);
  globalThis.__stage1Access = {
    computeAccessSummary,
    isPaidSubscriptionActive, OwnershipError, supabaseAdmin: () => dbFor(rows),
  };
  let source = await readFile(new URL("../lib/access/requireAiAccess.ts", import.meta.url), "utf8");
  source = source.replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, "");
  source = `const { computeAccessSummary, isPaidSubscriptionActive, OwnershipError, supabaseAdmin } = globalThis.__stage1Access;\n${source}`;
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { requireAiAccess } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
  const check = () => requireAiAccess("9999999999", "lesson_generation");
  await assert.rejects(check, (error) => error.status === 403);
  rows.student_subscriptions = { is_active: true, payment_status: "paid", start_at: new Date(Date.now() - 1000).toISOString(), end_at: new Date(Date.now() + 60000).toISOString() };
  await check();
  rows.student_subscriptions.end_at = new Date(Date.now() - 1000).toISOString();
  await assert.rejects(check, (error) => error.status === 403);
  rows.access_override = { is_active: true, expires_at: new Date(Date.now() + 60000).toISOString() };
  await check();
  rows.access_override.expires_at = new Date(Date.now() - 1000).toISOString();
  await assert.rejects(check, (error) => error.status === 403);
  rows.topic_progress = [{ topic_id: "1" }];
  await check();
  rows.feature_flags = { key: "lesson_generation_enabled", enabled: false };
  await assert.rejects(check, (error) => error.status === 403);
  rows.feature_flags.enabled = null;
  await assert.rejects(check, (error) => error.status === 403);
  rows.feature_flags = null;
  rows.topic_progress = Array.from({ length: 5 }, (_, i) => ({ topic_id: String(i) }));
  await assert.rejects(() => requireAiAccess("9999999999", "teacher_qa"), (error) => error.status === 403);
  await assert.rejects(() => requireAiAccess("9999999999", "teacher_math"), (error) => error.status === 403);
  rows.topic_progress = [{ topic_id: "1" }];
  await requireAiAccess("9999999999", "teacher_qa");
  await requireAiAccess("9999999999", "teacher_math");
});
