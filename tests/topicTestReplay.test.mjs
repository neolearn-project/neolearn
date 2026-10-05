import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { NEW_TOPIC_TEST_QUESTION_COUNT, analyzeTextbookGroundedTopicQuestions, createTopicTestEvidenceExcerpts, resolveTopicTestEvidenceExcerpts, selectTextbookGroundedTopicQuestions, selectValidDistinctTopicQuestions, shuffleTopicTestOptions } from "../app/lib/topicTestContracts.mjs";

let moduleId = 0;

async function loadTopicTestRoute({ generatedQuestions, curriculum } = {}) {
  let source = await readFile(new URL("../app/api/topic-test/route.ts", import.meta.url), "utf8");
  source = source.replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, "");
  const replayRows = new Map();
  let providerCalls = 0;

  class ReplayAiRouteResponse extends Error {
    constructor(response) { super("replay"); this.response = response; }
  }
  class AiRouteInProgressError extends Error {}
  class AiRouteRequestHashMismatchError extends Error {}
  class DuplicateAiRequestError extends Error {}
  class OwnershipError extends Error {}
  const distinctTopics = ["fractions", "decimals", "geometry", "measurement", "patterns", "estimation", "addition", "subtraction", "multiplication", "division"];
  class OpenAI {
    constructor() {
      this.responses = { create: async () => {
        providerCalls += 1;
        const questions = generatedQuestions ?? Array.from({ length: 10 }, (_, index) => ({
          id: index + 1,
          question: `How does ${distinctTopics[index]} work in this example?`,
          options: [`answer-${index + 1}`, `wrong-a-${index + 1}`, `wrong-b-${index + 1}`, `wrong-c-${index + 1}`],
          correctIndex: 0,
          explanation: `The supported answer is answer ${index + 1}.`,
        }));
        return { output_text: JSON.stringify(questions) };
      } };
    }
  }

  const deps = {
    NextRequest: Request,
    NextResponse: { json: (body, init) => Response.json(body, init) },
    OpenAI,
    sha256Text: async () => "test-sha256",
    supabaseAdmin: () => ({}),
    BUILT_IN_CONTENT_MISSING_MESSAGE: "missing",
    resolveCurriculumContent: async () => curriculum || ({ matched: false, usable: false, reason: "invalid_selection", content: "", version: null }),
    inspectTextEvidence: () => ({ usable: false, kind: "none", text: "" }),
    isSourceDependentLiterature: () => false,
    sourceRequiredResponse: (value) => value,
    verifySourceProvenance: async () => false,
    OwnershipError,
    ownershipErrorResponse: () => Response.json({ ok: false }, { status: 401 }),
    requireStudentMobile: async (_request, mobile) => ({ mobile, user: { id: "student-1" } }),
    DuplicateAiRequestError,
    duplicateAiRequestResponse: () => Response.json({ ok: false }, { status: 409 }),
    recordOpenAIUsage: async ({ call }) => call(),
    resolveAiRequestId: (request) => request.headers.get("x-request-id"),
    AiRouteInProgressError,
    AiRouteRequestHashMismatchError,
    ReplayAiRouteResponse,
    aiRouteInProgressResponse: () => Response.json({ ok: false }, { status: 409 }),
    aiRouteRequestHashMismatchResponse: () => Response.json({ ok: false }, { status: 409 }),
    beginAiRouteRequest: async ({ requestId }) => {
      const existing = replayRows.get(requestId);
      if (existing?.complete) throw new ReplayAiRouteResponse(Response.json(existing.body, { status: existing.status }));
      if (existing) throw new AiRouteInProgressError();
      replayRows.set(requestId, { complete: false, body: null });
      return { id: requestId, requestId, attempt: 0 };
    },
    completeAiRouteRequest: async (reservation, response) => {
      const body = await response.clone().json();
      replayRows.set(reservation.id, { complete: true, body, status: response.status });
      return response;
    },
    failAiRouteRequest: async () => {},
    readJsonResponse: async (response) => ({ data: await response.json(), errorText: "" }),
    buildCompetitiveJsonQuestionInstruction: () => "",
    competitiveExamLabel: (value) => String(value || "exam"),
    isCompetitiveMode: () => false,
    sanitizePdfSafeText: (value) => String(value || ""),
    NEW_TOPIC_TEST_QUESTION_COUNT,
    analyzeTextbookGroundedTopicQuestions,
    createTopicTestEvidenceExcerpts,
    resolveTopicTestEvidenceExcerpts,
    selectTextbookGroundedTopicQuestions,
    selectValidDistinctTopicQuestions,
    shuffleTopicTestOptions,
  };

  globalThis.__topicTestReplayDeps = deps;
  source = `const { ${Object.keys(deps).join(", ")} } = globalThis.__topicTestReplayDeps;\n${source}`;
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = await import(`data:text/javascript;base64,${Buffer.from(`${js}\n// ${++moduleId}`).toString("base64")}`);
  return { POST: loaded.POST, getProviderCalls: () => providerCalls };
}

test("completed Topic Test replay returns identical shuffled options without regenerating", { concurrency: false }, async () => {
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  const previousRandom = Math.random;
  process.env.OPENAI_API_KEY = "test-only-topic-test-key";
  globalThis.fetch = async () => Response.json({ ok: true, features: { topicTest: true } });
  Math.random = () => 0;

  try {
    const { POST, getProviderCalls } = await loadTopicTestRoute();
    const request = () => new Request("http://localhost/api/topic-test", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "same-topic-test" },
      body: JSON.stringify({
        mobile: "9999999999", subject: "Mathematics", chapter: "Fractions", topic: "Equivalent fractions",
        track: "regular", language: "en",
      }),
    });

    const firstResponse = await POST(request());
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.equal(first.questions.length, 10);
    assert.equal(first.questions[0].correctIndex, 3);
    assert.equal(first.questions[0].options[3], "answer-1");
    assert.equal(getProviderCalls(), 1);

    const replayResponse = await POST(request());
    assert.equal(replayResponse.status, 200);
    const replay = await replayResponse.json();
    assert.deepEqual(replay.questions, first.questions);
    for (const item of replay.questions) {
      assert.equal(item.options[item.correctIndex], `answer-${item.id}`);
    }
    assert.equal(getProviderCalls(), 1, "a replay uses the completed response without another model generation");
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
    globalThis.fetch = previousFetch;
    Math.random = previousRandom;
    delete globalThis.__topicTestReplayDeps;
  }
});

function passageQuestions() {
  const sentences = [
    "Maya collected shells on the beach", "She arranged the shells by size", "Maya liked stories about the sea",
    "Maya could identify five kinds of shells", "Maya labelled each group carefully", "Her brother counted the largest shells",
    "Maya drew the spiral patterns", "She recorded the colours in a notebook", "Maya shared the collection with her class",
    "The class displayed the shells near the window",
  ];
  const passage = `${sentences.join(". ")}.`;
  const excerpts = createTopicTestEvidenceExcerpts(passage);
  const questions = sentences.map((sentence, index) => {
    const actor = index === 1 || index === 7 ? "She" : index === 5 ? "Her brother" : index === 9 ? "The class" : "Maya";
    const predicate = sentence.slice(actor.length + 1);
    const frame = "assertion";
    const fact = { id: `f${index + 1}`, claim: sentence, excerptId: excerpts[index].id, actor, actorPredicate: sentence, predicate, polarity: "positive", frame, attribution: null };
    const question = `What does the passage say about ${predicate}?`;
    const component = (displayText) => ({ claim: sentence, displayText, factIds: [fact.id], treatment: frame });
    return { id: index + 1, question, options: [predicate, `Wrong ${index + 1}A`, `Wrong ${index + 1}B`, `Wrong ${index + 1}C`], correctIndex: 0, explanation: sentence, grounding: { facts: [fact], premise: component(question), answer: component(predicate), explanation: component(sentence) } };
  });
  return { passage, questions };
}

test("ten passage-grounded questions accept pronouns, ordinary like, and ability could, then replay identically", { concurrency: false }, async () => {
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-only-topic-test-key";
  globalThis.fetch = async () => Response.json({ ok: true, features: { topicTest: true } });
  try {
    const { passage, questions } = passageQuestions();
    const { POST, getProviderCalls } = await loadTopicTestRoute({ generatedQuestions: questions, curriculum: { matched: true, usable: true, content: passage, version: "v1", topicId: "topic-1", subject: "English", chapter: "Shells", topic: "Maya's collection" } });
    const request = () => new Request("http://localhost/api/topic-test", { method: "POST", headers: { "content-type": "application/json", "x-request-id": "grounded-ten" }, body: JSON.stringify({ mobile: "9999999999", subjectId: "s1", chapterId: "c1", topicId: "topic-1", language: "en" }) });
    const first = await POST(request());
    assert.equal(first.status, 200);
    assert.equal((await first.clone().json()).questions.length, 10);
    const replay = await POST(request());
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), await first.json());
    assert.equal(getProviderCalls(), 1);
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousApiKey;
    globalThis.fetch = previousFetch; delete globalThis.__topicTestReplayDeps;
  }
});

test("terminal topic_test_retry_required 422 is completed and replayed without another generation", { concurrency: false }, async () => {
  const previousApiKey = process.env.OPENAI_API_KEY; const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-only-topic-test-key";
  globalThis.fetch = async () => Response.json({ ok: true, features: { topicTest: true } });
  try {
    const { POST, getProviderCalls } = await loadTopicTestRoute({ generatedQuestions: [] });
    const request = () => new Request("http://localhost/api/topic-test", { method: "POST", headers: { "content-type": "application/json", "x-request-id": "terminal-422" }, body: JSON.stringify({ mobile: "9999999999", subject: "Mathematics", topic: "Fractions" }) });
    const first = await POST(request()); const firstBody = await first.json();
    assert.equal(first.status, 422); assert.equal(firstBody.code, "topic_test_retry_required");
    const replay = await POST(request());
    assert.equal(replay.status, 422); assert.deepEqual(await replay.json(), firstBody);
    assert.equal(getProviderCalls(), 2, "the bounded initial and strict attempts are not repeated on replay");
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousApiKey;
    globalThis.fetch = previousFetch; delete globalThis.__topicTestReplayDeps;
  }
});
