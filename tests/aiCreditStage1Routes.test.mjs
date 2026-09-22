import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function loadRoute(name, deps) {
  let source = await readFile(new URL(`../app/api/${name}/route.ts`, import.meta.url), "utf8");
  source = source.replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, "");
  source = `const { ${Object.keys(deps).join(", ")} } = globalThis.__stage1Deps;\n${source}`;
  globalThis.__stage1Deps = deps;
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

for (const name of ["avatar-lesson", "teacher-quiz"]) {
  test(`${name} authenticates, authorizes, replays and retries without leaking identity`, { concurrency: false }, async () => {
    const calls = { provider: 0, ledger: 0, access: 0 };
    const rows = new Map();
    let auth = true;
    let access = true;
    let fail = false;
    class OwnershipError extends Error { constructor(message, status) { super(message); this.status = status; } }
    class ReplayAiRouteResponse extends Error { constructor(response) { super(); this.response = response; } }
    class AiRouteInProgressError extends Error {}
    class AiRouteRequestHashMismatchError extends Error {}
    class AiRouteOwnershipUnavailableError extends Error {}
    class AiRouteNotReplayableError extends Error {}
    class DuplicateAiRequestError extends Error {}
    const deps = {
      NextRequest: Request,
      NextResponse: { json: (body, init) => Response.json(body, init) },
      OpenAI: class {
        constructor() {
          this.audio = { speech: { create: async () => {
            calls.provider += 1;
            if (fail) throw new Error("secret-token-123");
            return { arrayBuffer: async () => Buffer.from("audio") };
          } } };
          this.responses = { create: async () => {
            calls.provider += 1;
            if (fail) throw new Error("secret-token-123");
            return { output_text: '{"questions":[]}' };
          } };
        }
      },
      OwnershipError,
      ownershipErrorResponse: (e) => Response.json({ ok: false, error: e.message }, { status: e.status }),
      requireStudentIdentity: async () => {
        if (!auth) throw new OwnershipError("Authentication required.", 401);
        return { user: { id: "student-id" }, mobile: "9999999999" };
      },
      requireStudentMobile: async (_req, mobile) => {
        if (!auth) throw new OwnershipError("Authentication required.", 401);
        if (mobile !== "9999999999") throw new OwnershipError("Student access denied.", 403);
      },
      requireAiAccess: async () => {
        calls.access += 1;
        if (!access) throw new OwnershipError("Student access denied.", 403);
      },
      resolveAiRequestId: (req) => req.headers.get("x-neolearn-request-id"),
      beginAiRouteRequest: async ({ requestId }) => {
        const row = rows.get(requestId);
        if (row?.response) throw new ReplayAiRouteResponse(row.response.clone());
        rows.set(requestId, { attempt: (row?.attempt || 0) + 1 });
        return { requestId, attempt: rows.get(requestId).attempt };
      },
      completeAiRouteRequest: async (reservation, response) => {
        rows.get(reservation.requestId).response = response.clone();
        return response;
      },
      failAiRouteRequest: async (reservation) => {
        if (reservation) rows.get(reservation.requestId).response = null;
      },
      recordOpenAIUsage: async ({ call, authoritativeBilling }) => {
        calls.ledger += 1;
        if (name === "avatar-lesson") assert.equal(authoritativeBilling, false);
        return call();
      },
      ReplayAiRouteResponse, AiRouteInProgressError, AiRouteRequestHashMismatchError,
      AiRouteOwnershipUnavailableError, AiRouteNotReplayableError,
      DuplicateAiRequestError,
      aiRouteInProgressResponse: () => Response.json({ ok: false }, { status: 409 }),
      aiRouteRequestHashMismatchResponse: () => Response.json({ ok: false }, { status: 409 }),
      aiRouteOwnershipUnavailableResponse: () => Response.json({ ok: false }, { status: 503 }),
      aiRouteNotReplayableResponse: () => Response.json({ ok: false }, { status: 409 }),
      duplicateAiRequestResponse: () => Response.json({ ok: false }, { status: 409 }),
    };
    process.env.OPENAI_API_KEY = "test-only-key";
    const { POST } = await loadRoute(name, deps);
    const request = (id, body = {}) => new Request(`http://localhost/api/${name}`, {
      method: "POST", headers: { "content-type": "application/json", "x-neolearn-request-id": id },
      body: JSON.stringify(body),
    });
    auth = false;
    assert.equal((await POST(request("unauth"))).status, 401);
    auth = true;
    assert.equal((await POST(request("cross", { mobile: "8888888888" }))).status, 403);
    access = false;
    assert.equal((await POST(request("denied"))).status, 403);
    assert.equal(calls.provider, 0);
    access = true;
    const first = await POST(request("valid"));
    const body = await first.json();
    assert.equal(first.status, 200);
    assert.equal(body.ok, true);
    assert.equal(name === "avatar-lesson" ? body.audioBase64.length : body.quiz.questions.length, name === "avatar-lesson" ? 8 : 0);
    assert.deepEqual(await (await POST(request("valid"))).json(), body);
    assert.equal(calls.provider, 1);
    fail = true;
    const logged = [];
    const oldError = console.error;
    console.error = (...args) => logged.push(args.join(" "));
    let failed;
    try { failed = await POST(request("retry")); }
    finally { console.error = oldError; }
    assert.equal(failed.status, 500);
    assert.doesNotMatch(JSON.stringify(await failed.json()), /secret-token|student-id|9999999999/);
    assert.doesNotMatch(logged.join(" "), /secret-token|student-id|9999999999/);
    fail = false;
    assert.equal((await POST(request("retry"))).status, 200);
    assert.equal(calls.provider, 3);
    assert.equal(calls.ledger, 3);
  });
}
