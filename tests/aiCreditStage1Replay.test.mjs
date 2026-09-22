import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import ts from "typescript";
import * as core from "../app/lib/aiUsageRouteReplayCore.mjs";

let moduleNonce = 0;

function replayDb() {
  const rows = new Map();
  let failInsert = false;
  let failCompletion = false;
  const key = (row) => `${row.student_id}:${row.feature}:${row.request_id}`;
  const api = {
    rows,
    setFailInsert(value) { failInsert = value; },
    setFailCompletion(value) { failCompletion = value; },
    from(table) {
      assert.equal(table, "ai_usage_requests");
      let mode = "select";
      let value;
      const filters = {};
      let statuses;
      const query = {
        insert(row) { mode = "insert"; value = row; return query; },
        select() { return query; },
        update(update) { mode = "update"; value = update; return query; },
        eq(column, expected) { filters[column] = expected; return query; },
        in(_column, allowed) { statuses = allowed; return query; },
        async single() {
          if (mode === "insert") {
            if (failInsert) return { data: null, error: { code: "DB_DOWN", message: "secret-db-detail" } };
            if (rows.has(key(value))) return { data: null, error: { code: "23505" } };
            const row = { ...value, id: String(rows.size + 1) };
            rows.set(key(row), row);
            return { data: { ...row }, error: null };
          }
          const row = [...rows.values()].find((entry) => entry.id === filters.id);
          if (failCompletion && value?.status === "success") return { data: null, error: { code: "DB_DOWN", message: "secret-db-detail" } };
          if (!row || (statuses && !statuses.includes(row.status)) || (filters.status && row.status !== filters.status)) return { data: null, error: { code: "NO_ROW" } };
          Object.assign(row, value);
          return { data: { ...row }, error: null };
        },
        async maybeSingle() {
          const row = [...rows.values()].find((entry) => Object.entries(filters).every(([name, expected]) => entry[name] === expected));
          return { data: row ? { ...row } : null, error: null };
        },
        then(resolve) {
          const row = [...rows.values()].find((entry) => entry.id === filters.id);
          if (row && mode === "update") Object.assign(row, value);
          return Promise.resolve({ error: row ? null : { code: "NO_ROW" } }).then(resolve);
        },
      };
      return query;
    },
  };
  return api;
}

async function productionReplay(db) {
  let source = await readFile(new URL("../app/lib/aiUsageRouteReplay.mjs", import.meta.url), "utf8");
  source = source.replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, "");
  globalThis.__stage1Replay = { createHash, NextResponse: { json: (body, init) => Response.json(body, init) },
    supabaseAdmin: () => db, ...core };
  source = `const { ${Object.keys(globalThis.__stage1Replay).join(", ")} } = globalThis.__stage1Replay;\n${source}`;
  return import(`data:text/javascript;base64,${Buffer.from(`${source}\n// ${++moduleNonce}`).toString("base64")}`);
}

async function route(name, replay, provider) {
  let source = await readFile(new URL(`../app/api/${name}/route.ts`, import.meta.url), "utf8");
  source = source.replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, "");
  class OwnershipError extends Error { constructor(message, status) { super(message); this.status = status; } }
  class DuplicateAiRequestError extends Error {}
  const deps = {
    NextRequest: Request, NextResponse: { json: (body, init) => Response.json(body, init) },
    OpenAI: class { constructor() { this.audio = { speech: { create: provider } }; this.responses = { create: provider }; } },
    OwnershipError, ownershipErrorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status }),
    requireStudentIdentity: async () => ({ user: { id: "student-id" }, mobile: "9999999999" }),
    requireStudentMobile: async () => {}, requireAiAccess: async () => {},
    resolveAiRequestId: (req) => req.headers.get("x-neolearn-request-id"),
    recordOpenAIUsage: async ({ call }) => call(),
    DuplicateAiRequestError, duplicateAiRequestResponse: () => Response.json({ ok: false }, { status: 409 }),
    ...replay,
  };
  globalThis.__stage1ReplayRoute = deps;
  source = `const { ${Object.keys(deps).join(", ")} } = globalThis.__stage1ReplayRoute;\n${source}`;
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return (await import(`data:text/javascript;base64,${Buffer.from(`${js}\n// ${++moduleNonce}`).toString("base64")}`)).POST;
}

const request = (name, id, body = {}) => new Request(`http://localhost/api/${name}`, {
  method: "POST", headers: { "content-type": "application/json", "x-neolearn-request-id": id }, body: JSON.stringify(body),
});

for (const name of ["avatar-lesson", "teacher-quiz"]) {
  test(`${name} blocks provider retry after replay completion database failure`, { concurrency: false }, async () => {
    process.env.OPENAI_API_KEY = "test-only-key";
    const db = replayDb();
    const replay = await productionReplay(db);
    let calls = 0;
    const POST = await route(name, replay, async () => {
      calls += 1;
      return name === "avatar-lesson"
        ? { arrayBuffer: async () => Buffer.from("audio") }
        : { output_text: '{"questions":[]}' };
    });
    db.setFailCompletion(true);
    const first = await POST(request(name, "completion-error"));
    assert.equal(first.status, 503);
    assert.equal(first.headers.get("retry-after"), "5");
    assert.equal((await POST(request(name, "completion-error"))).status, 409);
    assert.equal(calls, 1);
    const row = [...db.rows.values()][0];
    assert.equal(row.status, "in_progress");
    assert.equal(row.locked_until, "9999-12-31T23:59:59.000Z");
  });

  test(`${name} uses production replay ownership for insert errors, concurrency, duplicates and retry`, { concurrency: false }, async () => {
    const db = replayDb();
    const replay = await productionReplay(db);
    let calls = 0;
    let failProvider = false;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let waitForGate = false;
    const provider = async () => {
      calls += 1;
      if (waitForGate) await gate;
      if (failProvider) throw new Error("secret-provider-detail");
      return name === "avatar-lesson"
        ? { arrayBuffer: async () => Buffer.from("audio") }
        : { output_text: '{"questions":[]}' };
    };
    process.env.OPENAI_API_KEY = "test-only-key";
    const POST = await route(name, replay, provider);
    const logs = [];
    const oldError = console.error;
    console.error = (...args) => logs.push(args.join(" "));
    try {
      db.setFailInsert(true);
      const unavailable = await POST(request(name, "db-error"));
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.headers.get("retry-after"), "5");
      assert.equal(calls, 0);
      db.setFailInsert(false);
      waitForGate = true;
      const firstPending = POST(request(name, "concurrent"));
      for (let i = 0; i < 20 && calls === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(calls, 1);
      assert.equal((await POST(request(name, "concurrent"))).status, 409);
      assert.equal(calls, 1);
      waitForGate = false;
      release();
      const first = await firstPending;
      assert.equal(first.status, 200);
      assert.deepEqual(await (await POST(request(name, "concurrent"))).json(), await first.json());
      assert.equal(calls, 1);
      failProvider = true;
      assert.equal((await POST(request(name, "retry"))).status, 500);
      failProvider = false;
      assert.equal((await POST(request(name, "retry"))).status, 200);
      assert.equal(calls, 3);
      assert.doesNotMatch(logs.join(" "), /secret-provider-detail|secret-db-detail|student-id|9999999999/);
    } finally { console.error = oldError; }
  });
}

test("avatar JSON replay below, at and above the global cap", { concurrency: false }, async () => {
  process.env.OPENAI_API_KEY = "test-only-key";
  const scriptText = "x".repeat([1, 2, 3, 4].find((n) => (core.MAX_JSON_REPLAY_BYTES - Buffer.byteLength(JSON.stringify({ ok: true, text: "x".repeat(n), audioBase64: "" }))) % 4 === 0));
  const overhead = Buffer.byteLength(JSON.stringify({ ok: true, text: scriptText, audioBase64: "" }));
  const exactAudioBytes = ((core.MAX_JSON_REPLAY_BYTES - overhead) / 4) * 3;
  for (const [label, size, replayable] of [
    ["below", exactAudioBytes - 3, true], ["at", exactAudioBytes, true], ["above", exactAudioBytes + 3, false],
  ]) {
    const db = replayDb();
    const replay = await productionReplay(db);
    let calls = 0;
    const POST = await route("avatar-lesson", replay, async () => {
      calls += 1;
      return { arrayBuffer: async () => Buffer.alloc(size) };
    });
    const first = await POST(request("avatar-lesson", label, { scriptText }));
    assert.equal(first.status, 200);
    assert.equal(Buffer.byteLength(await first.clone().text()), core.MAX_JSON_REPLAY_BYTES + (label === "below" ? -4 : label === "above" ? 4 : 0));
    const duplicate = await POST(request("avatar-lesson", label, { scriptText }));
    assert.equal(duplicate.status, replayable ? 200 : 409);
    assert.equal(calls, 1);
    const row = [...db.rows.values()][0];
    assert.equal(row.status, "success");
    assert.equal(Boolean(row.response_body_base64), replayable);
  }
});
