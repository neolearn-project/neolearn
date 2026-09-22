import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

for (const name of ["generate-lesson", "teacher-qa", "teacher-math"]) {
  test(`${name} stops unauthenticated, cross-student and denied requests before provider work`, async () => {
    process.env.OPENAI_API_KEY = "test-only-key";
    let auth = false;
    let access = true;
    let providerCalls = 0;
    const providerPaths = [];
    let accessCalls = 0;
    class OwnershipError extends Error { constructor(message, status) { super(message); this.status = status; } }
    class ReplayAiRouteResponse extends Error {}
    class AiRouteInProgressError extends Error {}
    class AiRouteRequestHashMismatchError extends Error {}
    class AiRouteOwnershipUnavailableError extends Error {}
    class DuplicateAiRequestError extends Error {}
    const deps = {
      NextRequest: Request,
      NextResponse: { json: (body, init) => Response.json(body, init) },
      OpenAI: class { constructor() {
        this.responses = { create: async () => { providerCalls += 1; providerPaths.push("response"); return { output_text: "Valid answer" }; } };
        this.chat = { completions: { create: async () => { providerCalls += 1; providerPaths.push("chat"); return { choices: [{ message: { content: "Valid answer" } }] }; } } };
        this.embeddings = { create: async () => { providerCalls += 1; providerPaths.push("embedding"); return { data: [{ embedding: [0.1] }] }; } };
        this.audio = { speech: { create: async () => { providerCalls += 1; providerPaths.push("tts"); return { arrayBuffer: async () => Buffer.from("audio") }; } } };
      } },
      OwnershipError,
      ReplayAiRouteResponse, AiRouteInProgressError, AiRouteRequestHashMismatchError, AiRouteOwnershipUnavailableError,
      DuplicateAiRequestError,
      aiRouteInProgressResponse: () => Response.json({ ok: false }, { status: 409 }),
      aiRouteRequestHashMismatchResponse: () => Response.json({ ok: false }, { status: 409 }),
      aiRouteOwnershipUnavailableResponse: () => Response.json({ ok: false }, { status: 503 }),
      duplicateAiRequestResponse: () => Response.json({ ok: false }, { status: 409 }),
      ownershipErrorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status }),
      requireStudentIdentity: async () => {
        if (!auth) throw new OwnershipError("Authentication required.", 401);
        return { user: { id: "student-id" }, mobile: "9999999999" };
      },
      requireStudentMobile: async (_req, mobile) => {
        if (!auth) throw new OwnershipError("Authentication required.", 401);
        if (mobile !== "9999999999") throw new OwnershipError("Student access denied.", 403);
        return { user: { id: "student-id" }, mobile };
      },
      requireAiAccess: async () => {
        accessCalls += 1;
        if (!access) throw new OwnershipError("Student access denied.", 403);
      },
      resolveAiRequestId: () => "test-request",
      failAiRouteRequest: async () => {},
      beginAiRouteRequest: async () => ({ id: "owned", attempt: 0 }),
      completeAiRouteRequest: async (_reservation, response) => response,
      recordOpenAIUsage: async ({ call }) => call(),
      competitiveExamLabel: () => "CBSE",
      isCompetitiveMode: () => false,
      buildCompetitiveStructureInstruction: () => "",
      qaRepairCompetitiveText: (value) => value,
      getTeacherConfig: () => ({ classId: "6", displayName: "Maths", chapters: [{ id: "fractions", title: "Fractions" }] }),
      decidePersona: () => ({ language: "en", speed: "normal", style: "simple", notes: "" }),
      buildPersonaInstruction: () => "",
      supabaseAdminClient: () => ({ from: () => {
        const query = { select: () => query, eq: () => query, update: () => query,
          match: async () => ({ error: null }), maybeSingle: async () => ({ data: null, error: null }),
          insert: async () => ({ error: null }) };
        return query;
      } }),
    };
    let source = await readFile(new URL(`../app/api/${name}/route.ts`, import.meta.url), "utf8");
    source = source.replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, "");
    source = `const { ${Object.keys(deps).join(", ")} } = globalThis.__stage1ExistingDeps;\n${source}`;
    globalThis.__stage1ExistingDeps = deps;
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const { POST } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
    const request = (mobile = "9999999999") => new Request(`http://localhost/api/${name}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mobile, studentMobile: mobile, question: "What is one plus one?" }),
    });
    assert.equal((await POST(request())).status, 401);
    auth = true;
    assert.equal((await POST(request("8888888888"))).status, 403);
    access = false;
    assert.equal((await POST(request())).status, 403);
    assert.equal(accessCalls, 1);
    assert.equal(providerCalls, 0);
    access = true;
    if (name === "teacher-math") {
      const direct = new Request(`http://localhost/api/${name}`, { method: "POST", body: JSON.stringify({
        question: "Explain fractions", selectedTopic: "Fractions", mobile: "9999999999",
      }) });
      const directResponse = await POST(direct);
      const directBody = await directResponse.json();
      assert.equal(directResponse.status, 200, JSON.stringify(directBody));
      assert.equal(directBody.source, "direct-topic-lock");
      assert.deepEqual(providerPaths, ["response"]);
      providerPaths.length = 0;
      const genericResponse = await POST(request());
      assert.equal(genericResponse.status, 200);
      assert.equal((await genericResponse.json()).answer, "Valid answer");
      assert.deepEqual(providerPaths, ["response", "embedding", "tts"]);
    } else {
      const valid = await POST(request());
      assert.equal(valid.status, 200);
      const result = await valid.json();
      assert.equal(name === "generate-lesson" ? result.script : result.answer, "Valid answer");
      assert.deepEqual(providerPaths, [name === "generate-lesson" ? "response" : "chat"]);
    }
  });
}
