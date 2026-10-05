import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  NEW_TOPIC_TEST_QUESTION_COUNT,
  analyzeTextbookGroundedTopicQuestions,
  createTopicTestEvidenceExcerpts,
  resolveTopicTestEvidenceExcerpts,
  selectTextbookGroundedTopicQuestions,
  shuffleTopicTestOptions,
  scoreTopicTest,
  selectValidDistinctTopicQuestions,
} from "../app/lib/topicTestContracts.mjs";

const route = await readFile(new URL("../app/api/topic-test/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/student/page.tsx", import.meta.url), "utf8");
const concepts = ["addition", "subtraction", "multiplication", "division", "fractions", "decimals", "geometry", "measurement", "patterns", "estimation", "algebra"];
const question = (id) => ({ id, question: `Apply the ${concepts[id - 1]} concept`, options: ["A", "B", "C", "D"], correctIndex: id % 4, explanation: "Grounded explanation" });

test("new tests require exactly ten distinct valid questions and never pad duplicates", () => {
  assert.equal(NEW_TOPIC_TEST_QUESTION_COUNT, 10);
  const source = Array.from({ length: 10 }, (_, index) => question(index + 1));
  source.push({ ...question(11), question: source[0].question });
  assert.equal(selectValidDistinctTopicQuestions(source).length, 10);
  assert.equal(selectValidDistinctTopicQuestions(source.slice(0, 9)).length, 9);
  assert.match(route, /topic_test_retry_required/);
  assert.match(page, /NEW_TOPIC_TEST_QUESTION_COUNT/);
});

test("scoring derives from actual count, including legacy five-question tests", () => {
  const legacy = Array.from({ length: 5 }, (_, index) => question(index + 1));
  const answers = Object.fromEntries(legacy.map((item, index) => [item.id, index < 4 ? item.correctIndex : -1]));
  assert.deepEqual(scoreTopicTest(legacy, answers), { correct: 4, total: 5, percent: 80 });
  const current = Array.from({ length: 10 }, (_, index) => question(index + 1));
  assert.equal(scoreTopicTest(current, Object.fromEntries(current.map((item) => [item.id, item.correctIndex]))).percent, 100);
});

test("option shuffling keeps each correct answer paired with its updated index", () => {
  const source = Array.from({ length: 10 }, (_, index) => question(index + 1));
  const shuffled = shuffleTopicTestOptions(source, () => 0);
  assert.equal(shuffled.length, 10);
  for (let index = 0; index < source.length; index += 1) {
    const expectedAnswer = source[index].options[source[index].correctIndex];
    assert.equal(shuffled[index].options[shuffled[index].correctIndex], expectedAnswer);
    assert.notDeepEqual(shuffled[index].options, source[index].options);
  }
  assert.deepEqual(source[0].options, ["A", "B", "C", "D"], "shuffling does not mutate the generated questions");
});

test("shuffled order is prepared once before replay storage and client rendering keeps it", () => {
  assert.equal((route.match(/shuffleTopicTestOptions\(responseQuestions\)/g) || []).length, 1);
  const shuffleAt = route.lastIndexOf("shuffleTopicTestOptions(responseQuestions)");
  const replayAt = route.lastIndexOf("return completeAiRouteRequest(");
  assert.ok(shuffleAt >= 0 && shuffleAt < replayAt);
  assert.match(route.slice(replayAt), /questions: returnedQuestions/);
  assert.doesNotMatch(page, /shuffleTopicTestOptions|\.sort\([^)]*options/);
  assert.match(page, /q\.correctIndex === optionIndex/);
  assert.match(page, /topicTestAnswers\[q\.id\] === q\.correctIndex/);
});

function groundedItem({ questionText, options, correctIndex = 0, explanation, fact, treatment = fact.frame }) {
  const section = (claim, displayText) => ({ claim, displayText, factIds: [fact.id], treatment });
  return {
    id: 1,
    question: questionText,
    options,
    correctIndex,
    explanation,
    grounding: {
      facts: [fact],
      premise: section(fact.claim, questionText),
      answer: section(fact.claim, options[correctIndex]),
      explanation: section(fact.claim, explanation),
    },
  };
}

function fact({ claim, evidence, actor, actorPredicate, predicate, polarity = "positive", frame = "assertion", attribution = null }) {
  return { id: "f1", claim, evidence, actor, actorPredicate, predicate, polarity, frame, attribution };
}

test("grounding fact map rejects an actor substituted into another character's event", () => {
  const passage = "Rani crossed the old bridge. Mina watched from the riverbank.";
  const falseFact = fact({
    claim: "Mina crossed the old bridge.", evidence: "Rani crossed the old bridge.", actor: "Mina",
    actorPredicate: "Mina crossed", predicate: "crossed the old bridge",
  });
  const item = groundedItem({
    questionText: "Which bridge did Mina cross?", options: ["The old bridge", "A road", "A stream", "A tunnel"],
    explanation: "Mina crossed the old bridge.", fact: falseFact,
  });
  assert.deepEqual(selectTextbookGroundedTopicQuestions([item], passage), []);
});

test("grounding rejects a displayed quantity absent from verified evidence", () => {
  const passage = "Maya collected 3 shells.";
  const numericFact = fact({
    claim: passage, evidence: passage, actor: "Maya",
    actorPredicate: "Maya collected", predicate: "collected 3 shells",
  });
  const item = groundedItem({
    questionText: "Did Maya collect 3 shells?", options: ["30 shells", "4 shells", "5 shells", "6 shells"],
    explanation: passage, fact: numericFact,
  });
  const diagnostics = analyzeTextbookGroundedTopicQuestions([item], passage);
  assert.equal(diagnostics.acceptedCount, 0);
  assert.equal(diagnostics.rejectionCodes.displayed_content_mismatch, 1);
});

test("grounding accepts a numeric-only answer supported by verified evidence", () => {
  const passage = "Maya collected 3 shells.";
  const numericFact = fact({
    claim: passage, evidence: passage, actor: "Maya",
    actorPredicate: "Maya collected", predicate: "collected 3 shells",
  });
  const item = groundedItem({
    questionText: "Did Maya collect 3 shells?", options: ["3", "4", "5", "6"],
    explanation: passage, fact: numericFact,
  });
  const diagnostics = analyzeTextbookGroundedTopicQuestions([item], passage);
  assert.equal(diagnostics.acceptedCount, 1, `numeric answer rejection codes: ${JSON.stringify(diagnostics.rejectionCodes)}`);
});

test("grounding preserves valid negation", () => {
  const negativePassage = "Mina did not cross the bridge.";
  const negativeFact = fact({
    claim: "Mina did not cross the bridge.", evidence: negativePassage, actor: "Mina",
    actorPredicate: "Mina did not cross", predicate: "cross the bridge", polarity: "negative", frame: "negation",
  });
  const negativeItem = groundedItem({
    questionText: "What did Mina not cross?", options: ["The bridge", "The river", "The field", "The road"],
    explanation: "Mina did not cross the bridge.", fact: negativeFact,
  });
  const diagnostics = analyzeTextbookGroundedTopicQuestions([negativeItem], negativePassage);
  assert.equal(diagnostics.acceptedCount, 1, `negation rejection codes: ${JSON.stringify(diagnostics.rejectionCodes)}`);
});

test("grounding preserves attributed beliefs without establishing the believed event", () => {
  const beliefPassage = "Mina believed that the distant voice came from a parrot.";
  const beliefFact = fact({
    claim: "Mina believed the distant voice came from a parrot.", evidence: beliefPassage, actor: "Mina",
    actorPredicate: "Mina believed", predicate: "voice came from a parrot", frame: "belief", attribution: "Mina",
  });
  const beliefItem = groundedItem({
    questionText: "What did Mina believe about the voice?", options: ["It came from a parrot", "It came from a dog", "It was the river", "It was silent"],
    explanation: "Mina believed the voice came from a parrot.", fact: beliefFact,
  });
  const diagnostics = analyzeTextbookGroundedTopicQuestions([beliefItem], beliefPassage);
  assert.equal(diagnostics.acceptedCount, 1, `attributed-belief rejection codes: ${JSON.stringify(diagnostics.rejectionCodes)}`);
});

function multilingualFixture() {
  const passage = "Rani crossed the bridge to reach school.";
  const sourceFact = fact({
    claim: "Rani crossed the bridge to reach school.", evidence: passage, actor: "Rani",
    actorPredicate: "Rani crossed", predicate: "crossed the bridge",
  });
  return { passage, sourceFact };
}

test("English source fact maps support Hindi question wording", () => {
  const { passage, sourceFact } = multilingualFixture();
  const hindi = groundedItem({
    questionText: "\u0930\u093e\u0928\u0940 \u0935\u093f\u0926\u094d\u092f\u093e\u0932\u092f \u0915\u0948\u0938\u0947 \u092a\u0939\u0941\u0901\u091a\u0940?",
    options: ["\u092a\u0941\u0932 \u092a\u093e\u0930\u0915\u0930", "\u0928\u093e\u0935", "\u0930\u0947\u0932", "\u0926\u094c\u0921\u093c\u0915\u0930"],
    explanation: "\u0930\u093e\u0928\u0940 \u092a\u0941\u0932 \u092a\u093e\u0930 \u0915\u0930\u0915\u0947 \u0935\u093f\u0926\u094d\u092f\u093e\u0932\u092f \u092a\u0939\u0941\u0901\u091a\u0940\u0964",
    fact: sourceFact,
  });
  assert.equal(selectTextbookGroundedTopicQuestions([hindi], passage).length, 1);
});

test("English source fact maps support Bengali question wording", () => {
  const { passage, sourceFact } = multilingualFixture();
  const bengali = groundedItem({
    questionText: "\u09b0\u09be\u09a8\u09bf \u0995\u09c0\u09ad\u09be\u09ac\u09c7 \u09b8\u09cd\u0995\u09c1\u09b2\u09c7 \u09aa\u09cc\u0981\u099b\u09c7\u099b\u09bf\u09b2?",
    options: ["\u09b8\u09c7\u09a4\u09c1 \u09aa\u09be\u09b0 \u09b9\u09df\u09c7", "\u09a8\u09cc\u0995\u09be", "\u099f\u09cd\u09b0\u09c7\u09a8", "\u09a6\u09cc\u09a1\u09bc\u09c7"],
    explanation: "\u09b0\u09be\u09a8\u09bf \u09b8\u09c7\u09a4\u09c1 \u09aa\u09be\u09b0 \u09b9\u09df\u09c7 \u09b8\u09cd\u0995\u09c1\u09b2\u09c7 \u09aa\u09cc\u0981\u099b\u09c7\u099b\u09bf\u09b2\u0964",
    fact: sourceFact,
  });
  assert.equal(selectTextbookGroundedTopicQuestions([bengali], passage).length, 1);
});

test("comparison evidence cannot be reframed as an event", () => {
  const passage = "The voice sounded like a monkey's call.";
  const comparisonFact = fact({
    claim: "The voice sounded like a monkey's call.", evidence: passage, actor: "voice",
    actorPredicate: "voice sounded like", predicate: "sounded like a monkey's call", frame: "assertion",
  });
  const inventedEvent = groundedItem({
    questionText: "Which animal made the call?", options: ["A monkey", "A parrot", "A fox", "A cat"],
    explanation: "A monkey made the call.", fact: comparisonFact,
  });
  assert.deepEqual(selectTextbookGroundedTopicQuestions([inventedEvent], passage), []);

  const validComparisonFact = { ...comparisonFact, frame: "comparison" };
  const validComparison = groundedItem({
    questionText: "What was the voice compared to?", options: ["A monkey's call", "A drum", "The river", "A bell"],
    explanation: "The voice was compared to a monkey's call.", fact: validComparisonFact, treatment: "comparison",
  });
  assert.equal(selectTextbookGroundedTopicQuestions([validComparison], passage).length, 1);
});

test("grounding accepts source pronouns, ordinary like, ability could, and faithful paraphrases", () => {
  const passage = "Maya studied shells. She liked collecting them like her brother and could identify five kinds.";
  const sourceFact = fact({
    claim: "She liked collecting shells and could identify five kinds.",
    evidence: "She liked collecting them like her brother and could identify five kinds.",
    actor: "She", actorPredicate: "She liked collecting", predicate: "could identify five kinds",
  });
  const item = groundedItem({
    questionText: "What ability did Maya have?", options: ["She identified five shell kinds", "She crossed a bridge", "She found gold", "She sailed away"],
    explanation: "Maya was able to identify five kinds of shells.", fact: sourceFact,
  });
  item.grounding.premise.claim = "Maya had the ability to identify five kinds of shells.";
  item.grounding.answer.claim = "Maya identified five shell kinds.";
  item.grounding.explanation.claim = "Maya could identify five kinds of shells.";
  assert.equal(selectTextbookGroundedTopicQuestions([item], passage).length, 1);
});

test("an invented detail is rejected even when the actor is correct and fact.claim repeats it", () => {
  const passage = "Maya collected white shells on the beach.";
  const inventedFact = fact({
    claim: "Maya collected gold shells on the beach.", evidence: passage, actor: "Maya",
    actorPredicate: "Maya collected", predicate: "collected white shells",
  });
  const item = groundedItem({
    questionText: "What gold shells did Maya collect?", options: ["Gold shells", "Pebbles", "Leaves", "Coins"],
    explanation: "Maya collected gold shells.", fact: inventedFact,
  });
  assert.deepEqual(selectTextbookGroundedTopicQuestions([item], passage), []);
});

test("truthful grounding metadata cannot be attached to a different displayed correct answer", () => {
  const passage = "Rani crossed the old bridge.";
  const sourceFact = fact({ claim: passage, evidence: passage, actor: "Rani", actorPredicate: "Rani crossed", predicate: "crossed the old bridge" });
  const item = groundedItem({
    questionText: "Which bridge did Rani cross?", options: ["The new bridge", "The old bridge", "A rope bridge", "No bridge"],
    correctIndex: 0, explanation: "Rani crossed the old bridge.", fact: sourceFact,
  });
  item.grounding.answer.displayText = "The new bridge";
  assert.deepEqual(selectTextbookGroundedTopicQuestions([item], passage), []);
});

test("a rejected item does not reserve its duplicate signature from a later valid item", () => {
  const passage = "Rani crossed the old bridge.";
  const sourceFact = fact({ claim: passage, evidence: passage, actor: "Rani", actorPredicate: "Rani crossed", predicate: "crossed the old bridge" });
  const invalid = groundedItem({ questionText: "Which bridge did Rani cross?", options: ["The new bridge", "A road", "A stream", "A tunnel"], explanation: passage, fact: sourceFact });
  const valid = groundedItem({ questionText: "Which bridge did Rani cross?", options: ["The old bridge", "A road", "A stream", "A tunnel"], explanation: passage, fact: sourceFact });
  const diagnostics = analyzeTextbookGroundedTopicQuestions([invalid, valid], passage);
  assert.equal(diagnostics.acceptedCount, 1);
  assert.equal(diagnostics.duplicateCount, 0);
  assert.equal(diagnostics.accepted[0].options[0], "The old bridge");
});

test("question words are not actors while a different source character still conflicts", () => {
  const passage = "Rani crossed the old bridge. Mina watched from the bank.";
  const sourceFact = fact({ claim: "Rani crossed the old bridge.", evidence: "Rani crossed the old bridge.", actor: "Rani", actorPredicate: "Rani crossed", predicate: "crossed the old bridge" });
  const valid = groundedItem({ questionText: "Which bridge did Rani cross?", options: ["The old bridge", "The bank", "A road", "A tunnel"], explanation: "Rani crossed the old bridge.", fact: sourceFact });
  const substituted = groundedItem({ questionText: "What bridge did Mina cross?", options: ["The old bridge", "The bank", "A road", "A tunnel"], explanation: "Mina crossed the old bridge.", fact: sourceFact });
  assert.equal(selectTextbookGroundedTopicQuestions([valid], passage).length, 1);
  assert.deepEqual(selectTextbookGroundedTopicQuestions([substituted], passage), []);
  assert.equal(analyzeTextbookGroundedTopicQuestions([substituted], passage).rejectionCodes.actor_conflict, 1);
});

test("grounding diagnostics are structured aggregates and retain actor-substitution rejection", () => {
  const passage = "Rani crossed the old bridge. Mina watched from the bank.";
  const falseFact = fact({ claim: "Mina crossed the old bridge.", evidence: "Rani crossed the old bridge.", actor: "Rani", actorPredicate: "Rani crossed", predicate: "crossed the old bridge" });
  const item = groundedItem({ questionText: "Which bridge did Mina cross?", options: ["Old", "New", "Iron", "None"], explanation: "Mina crossed the old bridge.", fact: falseFact });
  const diagnostics = analyzeTextbookGroundedTopicQuestions([item, item], passage);
  assert.equal(diagnostics.generatedCount, 2);
  assert.equal(diagnostics.acceptedCount, 0);
  assert.deepEqual(Object.keys(diagnostics).sort(), ["accepted", "acceptedCount", "duplicateCount", "generatedCount", "rejectionCodes"].sort());
  assert.equal(diagnostics.rejectionCodes.evidence_unsupported_claim, 2);
});

test("evidence diagnostics expose precise first-failure codes without payload content", () => {
  const passage = "Rani did not cross the old bridge.";
  const base = fact({ claim: passage, evidence: passage, actor: "Rani", actorPredicate: "Rani did not cross", predicate: "cross the old bridge", polarity: "negative", frame: "negation" });
  const cases = [
    [{ ...base, actor: "" }, "evidence_missing_fields"],
    [{ ...base, evidence: "Rani did not cross a bridge." }, "evidence_non_verbatim_quote"],
    [{ ...base, predicate: "cross the new bridge" }, "evidence_actor_predicate_mismatch"],
    [{ ...base, polarity: "positive" }, "evidence_polarity_mismatch"],
    [{ ...base, frame: "assertion" }, "evidence_framing_mismatch"],
    [{ ...base, claim: "Rani did not cross the gold bridge." }, "evidence_unsupported_claim"],
  ];
  for (const [badFact, expectedCode] of cases) {
    const item = groundedItem({ questionText: "What did Rani not cross?", options: ["The old bridge", "The river", "The field", "The road"], explanation: passage, fact: badFact, treatment: badFact.frame });
    const diagnostics = analyzeTextbookGroundedTopicQuestions([item], passage);
    assert.deepEqual(diagnostics.rejectionCodes, { [expectedCode]: 1 });
  }

  const beliefPassage = "Mina believed that the voice came from a parrot.";
  const belief = fact({ claim: "Mina believed the voice came from a parrot.", evidence: beliefPassage, actor: "Mina", actorPredicate: "Mina believed", predicate: "voice came from a parrot", frame: "belief" });
  const beliefItem = groundedItem({ questionText: "What did Mina believe?", options: ["The voice came from a parrot", "A dog barked", "The river spoke", "Nothing"], explanation: belief.claim, fact: belief, treatment: "belief" });
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions([beliefItem], beliefPassage).rejectionCodes, { evidence_attribution_mismatch: 1 });
});

test("server excerpts resolve to authoritative source text and ignore altered model quotes", () => {
  const passage = "Maya studied shells. She did not collect the black shell. Its colour looked like coal.";
  const excerpts = createTopicTestEvidenceExcerpts(passage);
  assert.ok(excerpts.length >= 3);
  assert.ok(excerpts.every((excerpt) => passage.includes(excerpt.text)));
  assert.equal(excerpts.map((excerpt) => excerpt.text).some((text) => text.includes("She did not collect") && text.includes("Maya studied shells")), true);
  const sourceFact = { ...fact({ claim: "She did not collect the black shell.", evidence: "altered model quote", actor: "She", actorPredicate: "She did not collect", predicate: "collect the black shell", polarity: "negative", frame: "negation" }), excerptId: excerpts[1].id };
  const item = groundedItem({ questionText: "What did she not collect?", options: ["The black shell", "Coal", "A bridge", "Gold"], explanation: sourceFact.claim, fact: sourceFact, treatment: "negation" });
  const [resolved] = resolveTopicTestEvidenceExcerpts([item], excerpts);
  assert.equal(resolved.grounding.facts[0].evidence, excerpts[1].text);
  assert.notEqual(resolved.grounding.facts[0].evidence, "altered model quote");
  assert.equal(analyzeTextbookGroundedTopicQuestions([resolved], passage).acceptedCount, 1);
});

test("neighbouring excerpt framing does not replace framing governing the target proposition", () => {
  const passage = "Maya did not discard any shells. She arranged the white shells by size. Their rows looked like waves.";
  const excerpts = createTopicTestEvidenceExcerpts(passage);
  const sourceFact = { ...fact({ claim: "She arranged the white shells by size.", evidence: "ignored", actor: "She", actorPredicate: "She arranged", predicate: "arranged the white shells by size" }), excerptId: excerpts[1].id };
  const item = groundedItem({ questionText: "How did she arrange the white shells?", options: ["By size", "By colour", "At random", "In bags"], explanation: sourceFact.claim, fact: sourceFact });
  const [resolved] = resolveTopicTestEvidenceExcerpts([item], excerpts);
  assert.equal(analyzeTextbookGroundedTopicQuestions([resolved], passage).acceptedCount, 1);
});

test("unknown excerpt IDs and paraphrased actor/action fields are rejected", () => {
  const passage = "Maya studied shells. She collected five white shells.";
  const excerpts = createTopicTestEvidenceExcerpts(passage);
  const sourceFact = { ...fact({ claim: "She collected five white shells.", evidence: "ignored", actor: "She", actorPredicate: "She collected", predicate: "collected five white shells" }), excerptId: "excerpt_missing" };
  const item = groundedItem({ questionText: "What did she collect?", options: ["Five white shells", "Coal", "A bridge", "Gold"], explanation: sourceFact.claim, fact: sourceFact });
  const [unknown] = resolveTopicTestEvidenceExcerpts([item], excerpts);
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions([unknown], passage).rejectionCodes, { evidence_unknown_excerpt: 1 });

  item.grounding.facts[0] = { ...sourceFact, excerptId: excerpts[1].id, actor: "Maya", actorPredicate: "Maya gathered", predicate: "gathered five pale shells" };
  const [paraphrased] = resolveTopicTestEvidenceExcerpts([item], excerpts);
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions([paraphrased], passage).rejectionCodes, { evidence_actor_predicate_mismatch: 1 });
});

test("generation prompt requires excerpt IDs and exact source pronouns and fields", () => {
  assert.match(route, /reference exactly one supplied excerptId/);
  assert.match(route, /actor, actorPredicate, and predicate must each be exact, contiguous substrings/);
  assert.match(route, /Preserve a source pronoun as actor/);
  assert.match(route, /<source_text>[\s\S]*<source_excerpts>/);
});

test("generation and validation use only the selected curriculum-or-upload source", () => {
  assert.match(route, /const groundingSource = curriculum\?\.usable[\s\S]*suppliedEvidence\.usable/);
  assert.match(route, /const groundingPassage = groundingSource\?\.content/);
  assert.match(route, /\$\{groundingSource \? `\$\{groundingSource\.kind\}[\s\S]*<source_text>/);
  assert.match(route, /const resolvedCandidates = resolveTopicTestEvidenceExcerpts\(candidates, groundingExcerpts\);\s*const diagnostics = analyzeTextbookGroundedTopicQuestions\(resolvedCandidates, groundingPassage\)/);
  assert.doesNotMatch(route, /Trusted NeoLearn curriculum material[\s\S]*Server-verified extraction from a student-uploaded page/);
});
