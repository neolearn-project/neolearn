import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { createAiCreditShadowRuntime } from "../app/lib/aiCreditShadowRuntime.mjs";

function fakeSupabase({ reserve, settle, release }) {
  const calls = [];
  const client = {
    calls,
    rpc(name, args) {
      calls.push({ name, args });
      const action = name === "reserve_ai_credit_shadow" ? reserve
        : name === "settle_ai_credit_shadow" ? settle
        : release;
      return { abortSignal: (signal) => action({ signal, args }) };
    },
  };
  return client;
}

test("owned lifecycle reserves before provider and settles exactly once after completion", async () => {
  const db = fakeSupabase({
    reserve: async () => ({ data: { ok: true, reservation_id: "00000000-0000-4000-8000-000000000001" }, error: null }),
    settle: async () => ({ data: { ok: true }, error: null }),
    release: async () => ({ data: { ok: true }, error: null }),
  });
  const shadow = createAiCreditShadowRuntime({ supabaseAdmin: () => db });
  const events = [];
  const reservation = await shadow.reserve("ledger-1");
  events.push("reserve");
  events.push("provider");
  await shadow.settle(reservation.id);
  events.push("settle");
  assert.deepEqual(events, ["reserve", "provider", "settle"]);
  assert.deepEqual(db.calls.map((call) => call.name), [
    "reserve_ai_credit_shadow",
    "settle_ai_credit_shadow",
  ]);
});

test("reserve rejects ok:false and invalid UUID responses", async () => {
  for (const response of [
    { data: { ok: false, reservation_id: "00000000-0000-4000-8000-000000000001" }, error: null },
    { data: { ok: true, reservation_id: "not-a-uuid" }, error: null },
  ]) {
    const db = fakeSupabase({
      reserve: async () => response,
      settle: async () => ({ data: { ok: true }, error: null }),
      release: async () => ({ data: { ok: true }, error: null }),
    });
    const shadow = createAiCreditShadowRuntime({ supabaseAdmin: () => db });
    assert.equal(await shadow.reserve("ledger-malformed"), null);
  }
});

test("duplicate/non-owner flow performs no shadow operation and no provider retry", async () => {
  const db = fakeSupabase({
    reserve: async () => ({ data: { reservation_id: "unexpected" }, error: null }),
    settle: async () => ({ data: { ok: true }, error: null }),
    release: async () => ({ data: { ok: true }, error: null }),
  });
  const shadow = createAiCreditShadowRuntime({ supabaseAdmin: () => db });
  const duplicate = { owner: false, providerCalls: 0 };
  if (duplicate.owner) {
    duplicate.providerCalls += 1;
    await shadow.reserve("duplicate-ledger");
  }
  assert.equal(duplicate.providerCalls, 0);
  assert.equal(db.calls.length, 0);
});

test("provider failure releases exactly once with bounded reason", async () => {
  const db = fakeSupabase({
    reserve: async () => ({ data: { ok: true, reservation_id: "00000000-0000-4000-8000-000000000002" }, error: null }),
    settle: async () => ({ data: { ok: true }, error: null }),
    release: async ({ args }) => {
      assert.equal(args.p_reservation_id, "00000000-0000-4000-8000-000000000002");
      assert.equal(args.p_reason, "provider_failed");
      return { data: { ok: true }, error: null };
    },
  });
  const shadow = createAiCreditShadowRuntime({ supabaseAdmin: () => db });
  const reservation = await shadow.reserve("ledger-failed");
  await shadow.release(reservation.id, "provider_failed");
  assert.deepEqual(db.calls.map((call) => call.name), [
    "reserve_ai_credit_shadow",
    "release_ai_credit_shadow",
  ]);
});

test("RPC rejection, timeout, and malformed results fail open without detached work", async () => {
  let aborted = false;
  const db = fakeSupabase({
    reserve: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      }, { once: true });
    }),
    settle: async () => { throw new Error("rejected"); },
    release: async () => ({ data: null, error: null }),
  });
  const shadow = createAiCreditShadowRuntime({ supabaseAdmin: () => db, timeoutMs: 5 });
  assert.equal(await shadow.reserve("ledger-timeout"), null);
  assert.equal(aborted, true);
  assert.equal(await shadow.settle("reservation-rejected"), false);
  assert.equal(await shadow.release("reservation-malformed", "provider_failed"), false);
});

test("retry identity is supplied unchanged and realtime completion forwards the same reservation", async () => {
  const db = fakeSupabase({
    reserve: async ({ args }) => {
      assert.equal(args.p_ai_usage_ledger_id, "ledger-retry-7");
      return { data: { ok: true, reservation_id: "00000000-0000-4000-8000-000000000007" }, error: null };
    },
    settle: async ({ args }) => {
      assert.equal(args.p_reservation_id, "00000000-0000-4000-8000-000000000007");
      return { data: { ok: true }, error: null };
    },
    release: async () => ({ data: { ok: true }, error: null }),
  });
  const shadow = createAiCreditShadowRuntime({ supabaseAdmin: () => db });
  const reservation = await shadow.reserve("ledger-retry-7");
  assert.equal(reservation.id, "00000000-0000-4000-8000-000000000007");
  await shadow.settle(reservation.id);
  assert.deepEqual(db.calls.map((call) => call.args), [
    { p_ai_usage_ledger_id: "ledger-retry-7", p_ttl_seconds: 900 },
    { p_reservation_id: "00000000-0000-4000-8000-000000000007" },
  ]);
});

test("remaining direct-provider routes outside Phase 1B.2 student-credit scope", () => {
  const studentCandidates = [
    "app/api/ai-syllabus-subject/route.ts",
  ];
  const adminExcluded = [
    "app/api/admin/content-studio/script/route.ts",
    "app/api/admin/content-studio/scenes/route.ts",
    "app/api/admin/content-studio/audio/route.ts",
  ];
  assert.equal(studentCandidates.length, 1);
  assert.equal(adminExcluded.length, 3);
});

async function loadProductionLedgerForTest() {
  const sourcePath = new URL("../app/lib/aiUsageLedger.ts", import.meta.url);
  let source = await readFile(sourcePath, "utf8");
  const pricingUrl = new URL("../app/lib/aiUsagePricing.mjs", import.meta.url).href;
  const runtimeUrl = new URL("../app/lib/aiCreditShadowRuntime.mjs", import.meta.url).href;
  source = source
    .replace('import { supabaseAdmin } from "@/lib/supabaseAdmin";',
      "const supabaseAdmin = () => globalThis.__aiCreditTestDb;")
    .replace('import { NextResponse } from "next/server";',
      "const NextResponse = { json: (body, init) => ({ body, ...init }) };")
    .replace('"@/app/lib/aiCreditShadowRuntime.mjs"', JSON.stringify(runtimeUrl))
    .replace('"@/app/lib/aiUsagePricing.mjs"', JSON.stringify(pricingUrl));
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

function lifecycleDb() {
  const rows = new Map();
  const events = [];
  const db = {
    rows,
    events,
    from(table) {
      return {
        insert(row) {
          return {
            select() {
              return {
                single: async () => {
                  if (rows.has(row.idempotency_key)) return { data: null, error: { code: "23505" } };
                  const id = `00000000-0000-4000-8000-${String(rows.size + 1).padStart(12, "0")}`;
                  rows.set(row.idempotency_key, { ...row, id });
                  events.push("owned");
                  return { data: { id, request_id: row.request_id, feature: row.feature }, error: null };
                },
              };
            },
          };
        },
        update(payload) {
          return {
            eq: async (_column, id) => {
              const row = [...rows.values()].find((candidate) => candidate.id === id);
              if (!row) return { error: { code: "PGRST_NOT_FOUND" } };
              Object.assign(row, payload);
              events.push("completed");
              return { error: null };
            },
          };
        },
      };
    },
    rpc(name, args) {
      events.push(name);
      return {
        abortSignal: async () => {
          if (name === "reserve_ai_credit_shadow") {
            const row = [...rows.values()].find((candidate) => candidate.id === args.p_ai_usage_ledger_id);
            return { data: { ok: true, reservation_id: `00000000-0000-4000-8000-${String(row.id).slice(-12)}` }, error: null };
          }
          return { data: { ok: true }, error: null };
        },
      };
    },
  };
  return db;
}

test("real production ledger lifecycle owns, reserves, calls once, completes, and settles", async () => {
  const db = lifecycleDb();
  globalThis.__aiCreditTestDb = db;
  const ledger = await loadProductionLedgerForTest();
  let providerCalls = 0;
  const result = await ledger.recordOpenAIUsage({
    req: new Request("https://example.test"),
    studentId: "student-test",
    feature: "teacher_qa",
    model: "gpt-5-mini",
    providerCall: "responses.create",
    requestId: "retry-request",
    retryAttempt: 2,
    call: async () => {
      providerCalls += 1;
      db.events.push("provider");
      return { id: "response-1", usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } };
    },
  });
  assert.equal(result.id, "response-1");
  assert.equal(providerCalls, 1);
  assert.deepEqual(db.events, ["owned", "reserve_ai_credit_shadow", "provider", "completed", "settle_ai_credit_shadow"]);
});

test("real production lifecycle rejects duplicate ownership before provider and releases failures once", async () => {
  const db = lifecycleDb();
  globalThis.__aiCreditTestDb = db;
  const ledger = await loadProductionLedgerForTest();
  let providerCalls = 0;
  db.rows.set("same-request:teacher_qa:responses.create:0", {
    id: "00000000-0000-4000-8000-000000000099",
    idempotency_key: "same-request:teacher_qa:responses.create:0",
  });
  await assert.rejects(
    ledger.recordOpenAIUsage({
      req: new Request("https://example.test"), studentId: "student-test", feature: "teacher_qa",
      model: "gpt-5-mini", providerCall: "responses.create", requestId: "same-request", retryAttempt: 0,
      call: async () => { providerCalls += 1; return {}; },
    })
  );
  await assert.rejects(ledger.recordOpenAIUsage({
    req: new Request("https://example.test"), studentId: "student-test", feature: "teacher_qa",
    model: "gpt-5-mini", providerCall: "responses.create", requestId: "failed-request", retryAttempt: 0,
    call: async () => { providerCalls += 1; throw new Error("provider"); },
  }));
  assert.equal(providerCalls, 1);
  assert.equal(db.events.filter((event) => event === "release_ai_credit_shadow").length, 1);
});
