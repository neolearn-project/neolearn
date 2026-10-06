import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { NEW_TOPIC_TEST_QUESTION_COUNT, analyzeTextbookGroundedTopicQuestions, createTopicTestSourceCatalog, resolveTopicTestSourceSpans, selectTextbookGroundedTopicQuestions, selectValidDistinctTopicQuestions, shuffleTopicTestOptions, validatePassageTopicTestCandidates, validatePassageTopicTestReviews } from "../app/lib/topicTestContracts.mjs";

let moduleId = 0;

async function loadTopicTestRoute({ generatedQuestions, generatedRounds, curriculum, reviewerFailure = false, reviewTransform } = {}) {
  let source = await readFile(new URL("../app/api/topic-test/route.ts", import.meta.url), "utf8");
  source = source.replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, "");
  const replayRows = new Map();
  const ledgerCalls = [];
  let providerCalls = 0;
  let generationCalls = 0;

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
      this.responses = { create: async (request) => {
        providerCalls += 1;
        const reviewing = String(request?.input?.[0]?.content || "").includes("independently review passage-grounded MCQs");
        if (reviewing) {
          if (reviewerFailure) throw new Error("offline reviewer failure");
          const user = String(request?.input?.[1]?.content || "");
          const match = user.match(/<candidates>\n([\s\S]*?)\n<\/candidates>/);
          const candidates = match ? JSON.parse(match[1]) : [];
          const reviews = candidates.map((candidate) => ({ id: candidate.id, decision: "accept", reasonCode: "accepted", candidate: reviewTransform ? reviewTransform(candidate) : candidate }));
          return { output_text: JSON.stringify(reviews) };
        }
        const questions = generatedRounds?.[generationCalls++] ?? generatedQuestions ?? Array.from({ length: 10 }, (_, index) => ({
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
    recordOpenAIUsage: async ({ call, providerCall, retryAttempt, metadata }) => {
      ledgerCalls.push({ providerCall, retryAttempt, metadata });
      return call();
    },
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
    createTopicTestSourceCatalog,
    resolveTopicTestSourceSpans,
    selectTextbookGroundedTopicQuestions,
    selectValidDistinctTopicQuestions,
    shuffleTopicTestOptions,
    validatePassageTopicTestCandidates,
    validatePassageTopicTestReviews,
  };

  globalThis.__topicTestReplayDeps = deps;
  source = `const { ${Object.keys(deps).join(", ")} } = globalThis.__topicTestReplayDeps;\n${source}`;
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = await import(`data:text/javascript;base64,${Buffer.from(`${js}\n// ${++moduleId}`).toString("base64")}`);
  return { POST: loaded.POST, getProviderCalls: () => providerCalls, getLedgerCalls: () => ledgerCalls };
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
  const catalog = createTopicTestSourceCatalog(passage);
  const questions = sentences.map((sentence, index) => {
    const scope = catalog.scopes[index];
    const actor = index === 1 || index === 7 ? "She" : index === 5 ? "Her brother" : index === 9 ? "The class" : "Maya";
    const predicate = sentence.slice(actor.length + 1);
    const question = `What does the passage say about ${predicate}?`;
    return { id: `candidate_${index + 1}`, question, options: [predicate, `Wrong ${index + 1}A`, `Wrong ${index + 1}B`, `Wrong ${index + 1}C`], correctIndex: 0, explanation: sentence, sourceReferences: [scope.id] };
  });
  return { passage, questions };
}

test("ten passage-grounded questions accept pronouns, ordinary like, and ability could, then replay identically", { concurrency: false }, async () => {
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  const previousRandom = Math.random;
  process.env.OPENAI_API_KEY = "test-only-topic-test-key";
  globalThis.fetch = async () => Response.json({ ok: true, features: { topicTest: true } });
  Math.random = () => 0;
  try {
    const { passage, questions } = passageQuestions();
    const { POST, getProviderCalls, getLedgerCalls } = await loadTopicTestRoute({ generatedQuestions: questions, curriculum: { matched: true, usable: true, content: passage, version: "v1", topicId: "topic-1", subject: "English", chapter: "Shells", topic: "Maya's collection" } });
    const request = () => new Request("http://localhost/api/topic-test", { method: "POST", headers: { "content-type": "application/json", "x-request-id": "grounded-ten" }, body: JSON.stringify({ mobile: "9999999999", subjectId: "s1", chapterId: "c1", topicId: "topic-1", language: "en" }) });
    const first = await POST(request());
    assert.equal(first.status, 200);
    const firstBody = await first.clone().json();
    assert.equal(firstBody.questions.length, 10);
    for (let index = 0; index < firstBody.questions.length; index += 1) {
      assert.equal(firstBody.questions[index].correctIndex, 3);
      assert.equal(firstBody.questions[index].options[firstBody.questions[index].correctIndex], questions[index].options[0]);
    }
    const replay = await POST(request());
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), await first.json(), "replay returns the stored shuffled order without a second shuffle");
    assert.equal(getProviderCalls(), 2);
    assert.deepEqual(getLedgerCalls().map(({ providerCall, metadata }) => [providerCall, metadata.stage]), [["responses.create", "generation"], ["responses.create.topic_test_review", "review"]]);
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousApiKey;
    globalThis.fetch = previousFetch; Math.random = previousRandom; delete globalThis.__topicTestReplayDeps;
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
    assert.equal(getProviderCalls(), 2, "ungrounded generation remains bounded and is not repeated on replay");
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousApiKey;
    globalThis.fetch = previousFetch; delete globalThis.__topicTestReplayDeps;
  }
});

test("reviewer failure returns completed retry-required 422 and replay makes no provider call", { concurrency: false }, async () => {
  const previousApiKey = process.env.OPENAI_API_KEY; const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-only-topic-test-key";
  globalThis.fetch = async () => Response.json({ ok: true, features: { topicTest: true } });
  try {
    const { passage, questions } = passageQuestions();
    const route = await loadTopicTestRoute({ generatedQuestions: questions, reviewerFailure: true, curriculum: { matched: true, usable: true, content: passage, version: "v1", topicId: "topic-1", subject: "English", chapter: "Shells", topic: "Shells" } });
    const request = () => new Request("http://localhost/api/topic-test", { method: "POST", headers: { "content-type": "application/json", "x-request-id": "reviewer-failure" }, body: JSON.stringify({ mobile: "9999999999", subjectId: "s", chapterId: "c", topicId: "topic-1" }) });
    const first = await route.POST(request()); const body = await first.json();
    assert.equal(first.status, 422); assert.equal(body.code, "topic_test_retry_required");
    assert.equal(route.getProviderCalls(), 2);
    const replay = await route.POST(request());
    assert.equal(replay.status, 422); assert.deepEqual(await replay.json(), body);
    assert.equal(route.getProviderCalls(), 2);
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousApiKey;
    globalThis.fetch = previousFetch; delete globalThis.__topicTestReplayDeps;
  }
});

test("reviewer-complete corrected index survives final option shuffle", { concurrency: false }, async () => {
  const previousApiKey = process.env.OPENAI_API_KEY; const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-only-topic-test-key";
  globalThis.fetch = async () => Response.json({ ok: true, features: { topicTest: true } });
  try {
    const { passage, questions } = passageQuestions();
    const route = await loadTopicTestRoute({ generatedQuestions: questions, reviewTransform: (item) => ({ ...item, correctIndex: 2, explanation: `Corrected review for ${item.options[2]}.` }), curriculum: { matched: true, usable: true, content: passage, version: "v1", topicId: "topic-1", subject: "English", chapter: "Shells", topic: "Shells" } });
    const response = await route.POST(new Request("http://localhost/api/topic-test", { method: "POST", headers: { "content-type": "application/json", "x-request-id": "corrected-index" }, body: JSON.stringify({ mobile: "9999999999", topicId: "topic-1" }) }));
    const body = await response.json();
    assert.equal(response.status, 200);
    for (const item of body.questions) assert.match(item.options[item.correctIndex], /^Wrong \d+B$/);
    assert.equal(route.getProviderCalls(), 2);
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousApiKey;
    globalThis.fetch = previousFetch; delete globalThis.__topicTestReplayDeps;
  }
});

test("cross-round reused candidate IDs become ten unique server-owned student IDs before replay", { concurrency: false }, async () => {
  const previousApiKey = process.env.OPENAI_API_KEY; const previousFetch = globalThis.fetch; const previousRandom = Math.random;
  process.env.OPENAI_API_KEY = "test-only-topic-test-key";
  globalThis.fetch = async () => Response.json({ ok: true, features: { topicTest: true } });
  Math.random = () => 0;
  try {
    const { passage, questions } = passageQuestions();
    const firstRound = questions.slice(0, 6);
    const secondRound = questions.slice(6).map((item, index) => ({ ...item, id: `candidate_${index + 1}` }));
    const expected = [...firstRound, ...secondRound];
    const route = await loadTopicTestRoute({
      generatedRounds: [firstRound, secondRound],
      curriculum: { matched: true, usable: true, content: passage, version: "v1", topicId: "topic-1", subject: "English", chapter: "Shells", topic: "Shells" },
    });
    const request = () => new Request("http://localhost/api/topic-test", { method: "POST", headers: { "content-type": "application/json", "x-request-id": "cross-round-candidate-ids" }, body: JSON.stringify({ mobile: "9999999999", topicId: "topic-1" }) });
    const firstResponse = await route.POST(request()); const firstBody = await firstResponse.json();
    assert.equal(firstResponse.status, 200);
    assert.deepEqual(firstBody.questions.map((item) => item.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(new Set(firstBody.questions.map((item) => item.id)).size, 10);
    for (let index = 0; index < firstBody.questions.length; index += 1) {
      assert.equal(firstBody.questions[index].options[firstBody.questions[index].correctIndex], expected[index].options[expected[index].correctIndex]);
    }
    assert.equal(route.getProviderCalls(), 4, "two bounded generation/review rounds make at most four provider calls");
    const replayResponse = await route.POST(request());
    assert.equal(replayResponse.status, 200);
    assert.deepEqual(await replayResponse.json(), firstBody);
    assert.equal(route.getProviderCalls(), 4, "completed replay does not generate or review again");
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousApiKey;
    globalThis.fetch = previousFetch; Math.random = previousRandom; delete globalThis.__topicTestReplayDeps;
  }
});
