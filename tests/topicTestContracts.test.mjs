import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  NEW_TOPIC_TEST_QUESTION_COUNT,
  analyzeTextbookGroundedTopicQuestions,
  createTopicTestEvidenceExcerpts,
  createTopicTestSourceCatalog,
  resolveTopicTestEvidenceExcerpts,
  resolveTopicTestSourceSpans,
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

test("client rendering, scoring, review and Weak Diagnosis keep the server-prepared option order", () => {
  assert.doesNotMatch(page, /shuffleTopicTestOptions|\.sort\([^)]*options/);
  assert.match(page, /q\.correctIndex === optionIndex/);
  assert.match(page, /topicTestAnswers\[q\.id\] === q\.correctIndex/);
  assert.match(page, /base\?\.options\?\.\[base\.correctIndex\]/);
  assert.match(page, /buildCompetitiveWeakDiagnosis\(/);
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

function spanRange(scope, phrase) {
  const relativeStart = scope.text.indexOf(phrase);
  assert.ok(relativeStart >= 0, `missing span phrase: ${phrase}`);
  const start = scope.start + relativeStart, end = start + phrase.length;
  const selected = scope.tokens.filter((token) => token.start >= start && token.end <= end);
  assert.ok(selected.length, `missing span tokens: ${phrase}`);
  return { startTokenId: selected[0].id, endTokenId: selected.at(-1).id };
}

function spanFact({ id = "f1", scope, claim, actor, actorPredicate, predicate, polarity = "positive", frame = "assertion", attribution = null }) {
  return {
    id, claim, scopeId: scope.id,
    actorSpan: spanRange(scope, actor),
    actorPredicateSpan: spanRange(scope, actorPredicate),
    predicateSpan: spanRange(scope, predicate),
    attributionSpan: attribution ? spanRange(scope, attribution) : null,
    polarity, frame,
  };
}

test("server token spans preserve Unicode, punctuation, and PDF line breaks", () => {
  const passage = "Māyā\ncollected तीन shells. She reached school.";
  const catalog = createTopicTestSourceCatalog(passage);
  assert.equal(catalog.usable, true);
  assert.equal(catalog.scopes.map((scope) => scope.text).join(" ").replace(/\s+/g, " "), passage.replace(/\s+/g, " "));
  const sourceFact = spanFact({ scope: catalog.scopes[0], claim: "Māyā collected तीन shells.", actor: "Māyā", actorPredicate: "Māyā\ncollected", predicate: "collected तीन shells" });
  const item = groundedItem({ questionText: "What did Māyā collect?", options: ["तीन shells", "Two books", "A bridge", "Nothing"], explanation: sourceFact.claim, fact: sourceFact });
  const [resolved] = resolveTopicTestSourceSpans([item], catalog, passage);
  assert.equal(resolved.grounding.facts[0].actorPredicate, "Māyā\ncollected");
  assert.equal(analyzeTextbookGroundedTopicQuestions([resolved], passage).acceptedCount, 1);
});

test("server token spans preserve inverted speech, auxiliaries, and source pronouns", () => {
  const passage = '"Go," said Rani. Mother had replied, "Maybe later." The next day she reached school.';
  const catalog = createTopicTestSourceCatalog(passage);
  const speech = { ...spanFact({ scope: catalog.scopes[0], claim: '"Go," said Rani.', actor: "Rani", actorPredicate: "said Rani", predicate: "Go", attribution: "Rani" }), actor: "Mina", actorPredicate: "Mina said", predicate: "Stay", evidence: "forged evidence" };
  const reply = spanFact({ id: "f2", scope: catalog.scopes[1], claim: 'Mother had replied, "Maybe later."', actor: "Mother", actorPredicate: "Mother had replied", predicate: "Maybe later", frame: "hypothetical", attribution: "Mother" });
  const arrival = spanFact({ id: "f3", scope: catalog.scopes[2], claim: "The next day she reached school.", actor: "she", actorPredicate: "she reached", predicate: "reached school" });
  const unresolved = [speech, reply, arrival].map((sourceFact, index) => groundedItem({ questionText: sourceFact.claim, options: [sourceFact.claim, `Wrong ${index}A`, `Wrong ${index}B`, `Wrong ${index}C`], explanation: sourceFact.claim, fact: sourceFact, treatment: sourceFact.frame }));
  const resolved = resolveTopicTestSourceSpans(unresolved, catalog, passage);
  assert.deepEqual(resolved.map((item) => item.grounding.facts[0].actorPredicate), ["said Rani", "Mother had replied", "she reached"]);
  assert.deepEqual({ actor: resolved[0].grounding.facts[0].actor, predicate: resolved[0].grounding.facts[0].predicate, evidence: resolved[0].grounding.facts[0].evidence }, { actor: "Rani", predicate: "Go", evidence: catalog.scopes[0].text });
  assert.equal(analyzeTextbookGroundedTopicQuestions(resolved, passage).acceptedCount, 3);
});

test("span resolution rejects forged ranges and actor-action substitution", () => {
  const passage = "Rani collected shells. Mina crossed the bridge.";
  const catalog = createTopicTestSourceCatalog(passage);
  const valid = spanFact({ scope: catalog.scopes[0], claim: "Rani collected shells.", actor: "Rani", actorPredicate: "Rani collected", predicate: "collected shells" });
  const itemFor = (sourceFact) => groundedItem({ questionText: sourceFact.claim, options: [sourceFact.claim, "Wrong A", "Wrong B", "Wrong C"], explanation: sourceFact.claim, fact: sourceFact });

  const unknown = { ...valid, actorSpan: { startTokenId: "forged_token", endTokenId: "forged_token" } };
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions(resolveTopicTestSourceSpans([itemFor(unknown)], catalog, passage), passage).rejectionCodes, { evidence_unknown_token: 1 });

  const unknownScope = { ...valid, scopeId: "forged_scope" };
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions(resolveTopicTestSourceSpans([itemFor(unknownScope)], catalog, passage), passage).rejectionCodes, { evidence_unknown_scope: 1 });

  const missing = { ...valid, actorSpan: null };
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions(resolveTopicTestSourceSpans([itemFor(missing)], catalog, passage), passage).rejectionCodes, { evidence_missing_fields: 1 });

  const reversed = { ...valid, predicateSpan: { startTokenId: valid.predicateSpan.endTokenId, endTokenId: valid.predicateSpan.startTokenId } };
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions(resolveTopicTestSourceSpans([itemFor(reversed)], catalog, passage), passage).rejectionCodes, { evidence_reversed_range: 1 });

  const crossScope = { ...valid, predicateSpan: { startTokenId: catalog.scopes[0].tokens[0].id, endTokenId: catalog.scopes[1].tokens.at(-1).id } };
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions(resolveTopicTestSourceSpans([itemFor(crossScope)], catalog, passage), passage).rejectionCodes, { evidence_cross_scope_range: 1 });

  const minaScope = catalog.scopes[1];
  const substituted = { ...valid, actorSpan: spanRange(catalog.scopes[0], "Rani"), actorPredicateSpan: spanRange(minaScope, "Mina crossed"), predicateSpan: spanRange(minaScope, "crossed the bridge") };
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions(resolveTopicTestSourceSpans([itemFor(substituted)], catalog, passage), passage).rejectionCodes, { evidence_cross_scope_range: 1 });

  const outside = { ...valid, actorSpan: spanRange(catalog.scopes[0], "Rani"), actorPredicateSpan: spanRange(catalog.scopes[0], "collected shells") };
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions(resolveTopicTestSourceSpans([itemFor(outside)], catalog, passage), passage).rejectionCodes, { evidence_actor_outside_actor_predicate: 1 });
});

test("source catalog limits report insufficient coverage without truncation", () => {
  const passage = "Rani collected shells. Mina crossed the bridge.";
  const catalog = createTopicTestSourceCatalog(passage, { maxSourceChars: 100, maxScopes: 1, maxTokens: 100, maxTokensPerScope: 100 });
  assert.equal(catalog.usable, false);
  assert.equal(catalog.reason, "too_many_scopes");
  assert.deepEqual(catalog.scopes, []);

  const oversized = createTopicTestSourceCatalog(passage, { maxSourceChars: 10, maxScopes: 100, maxTokens: 100, maxTokensPerScope: 100 });
  assert.equal(oversized.usable, false);
  assert.equal(oversized.reason, "source_too_large");
  assert.deepEqual(oversized.scopes, []);
});

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
    [{ ...base, actor: "Mina" }, "evidence_actor_mismatch"],
    [{ ...base, actorPredicate: "Rani never crossed" }, "evidence_actor_predicate_mismatch"],
    [{ ...base, predicate: "cross the new bridge" }, "evidence_predicate_mismatch"],
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

test("PDF-style line breaks preserve exact source pronouns through excerpt resolution", () => {
  const passage = "Maya studied shells. She\ncollected five white shells.";
  const excerpts = createTopicTestEvidenceExcerpts(passage);
  const excerpt = excerpts.find(({ text }) => text.includes("She\ncollected"));
  assert.ok(excerpt);
  const sourceFact = { ...fact({ claim: "She collected five white shells.", evidence: "ignored", actor: "She", actorPredicate: "She collected", predicate: "collected five white shells" }), excerptId: excerpt.id };
  const item = groundedItem({ questionText: "What did she collect?", options: ["Five white shells", "Coal", "A bridge", "Gold"], explanation: sourceFact.claim, fact: sourceFact });
  const [resolved] = resolveTopicTestEvidenceExcerpts([item], excerpts);
  assert.equal(analyzeTextbookGroundedTopicQuestions([resolved], passage).acceptedCount, 1);
});

test("captured source order, auxiliaries, and pronouns remain exact evidence fields", () => {
  const dialogue = '"They won\'t let me go to school," said Jahnavi.';
  const saidFact = fact({ claim: dialogue, evidence: dialogue, actor: "Jahnavi", actorPredicate: "said Jahnavi", predicate: "won't let me go to school", polarity: "negative", frame: "negation", attribution: "Jahnavi" });
  const saidItem = groundedItem({ questionText: dialogue, options: [dialogue, "Mother replied.", "The River left.", "School closed."], explanation: dialogue, fact: saidFact, treatment: "negation" });
  assert.equal(analyzeTextbookGroundedTopicQuestions([saidItem], dialogue).acceptedCount, 1);
  saidItem.grounding.facts[0] = { ...saidFact, actorPredicate: "Jahnavi said" };
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions([saidItem], dialogue).rejectionCodes, { evidence_actor_predicate_mismatch: 1 });

  const reply = 'Mother had replied, "Maybe later."';
  const replyFact = fact({ claim: reply, evidence: reply, actor: "Mother", actorPredicate: "Mother had replied", predicate: "Maybe later", frame: "hypothetical", attribution: "Mother" });
  const replyItem = groundedItem({ questionText: reply, options: [reply, "Never", "Today", "At school"], explanation: reply, fact: replyFact, treatment: "hypothetical" });
  assert.equal(analyzeTextbookGroundedTopicQuestions([replyItem], reply).acceptedCount, 1);
  replyItem.grounding.facts[0] = { ...replyFact, actorPredicate: "Mother replied" };
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions([replyItem], reply).rejectionCodes, { evidence_actor_predicate_mismatch: 1 });

  const arrival = "The next day she reached the school.";
  const arrivalFact = fact({ claim: arrival, evidence: arrival, actor: "she", actorPredicate: "she reached", predicate: "reached the school" });
  const arrivalItem = groundedItem({ questionText: arrival, options: [arrival, "She stayed home.", "She crossed a river.", "She met Mother."], explanation: arrival, fact: arrivalFact });
  assert.equal(analyzeTextbookGroundedTopicQuestions([arrivalItem], arrival).acceptedCount, 1);
  arrivalItem.grounding.facts[0] = { ...arrivalFact, actor: "Jahnavi", actorPredicate: "Jahnavi reached" };
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions([arrivalItem], arrival).rejectionCodes, { evidence_actor_mismatch: 1 });
});

test("captured multi-sentence claims are supported by linked atomic facts", () => {
  const passage = "Jahnavi called her brother Ettan. Ettan means Elder brother.";
  const first = { ...fact({ claim: "Jahnavi called her brother Ettan.", evidence: passage, actor: "Jahnavi", actorPredicate: "Jahnavi called", predicate: "called her brother Ettan" }), id: "f1" };
  const second = { ...fact({ claim: "Ettan means Elder brother.", evidence: passage, actor: "Ettan", actorPredicate: "Ettan means", predicate: "means Elder brother" }), id: "f2" };
  const combined = `${first.claim} ${second.claim}`;
  const item = groundedItem({ questionText: combined, options: [combined, "Ettan means friend.", "Jahnavi left.", "No name was used."], explanation: combined, fact: first });
  item.grounding.facts = [first, second];
  for (const component of [item.grounding.premise, item.grounding.answer, item.grounding.explanation]) {
    component.claim = combined;
    component.factIds = ["f1", "f2"];
  }
  const linkedDiagnostics = analyzeTextbookGroundedTopicQuestions([item], passage);
  assert.equal(linkedDiagnostics.acceptedCount, 1, `linked atomic facts diagnostics: ${JSON.stringify({
    generatedCount: linkedDiagnostics.generatedCount,
    acceptedCount: linkedDiagnostics.acceptedCount,
    duplicateCount: linkedDiagnostics.duplicateCount,
    rejectionCodes: linkedDiagnostics.rejectionCodes,
  })}`);

  const nonAtomic = { ...first, claim: combined, predicate: "Ettan means Elder brother" };
  item.grounding.facts = [nonAtomic];
  for (const component of [item.grounding.premise, item.grounding.answer, item.grounding.explanation]) component.factIds = ["f1"];
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions([item], passage).rejectionCodes, { evidence_non_atomic_fact: 1 });
});

function linkedGroundedItem({ questionText, options, explanation, facts, premiseClaim, answerClaim, explanationClaim }) {
  const factIds = facts.map(({ id }) => id);
  const component = (claim, displayText) => ({ claim, displayText, factIds, treatment: "assertion" });
  return {
    id: 1, question: questionText, options, correctIndex: 0, explanation,
    grounding: {
      facts,
      premise: component(premiseClaim, questionText),
      answer: component(answerClaim, options[0]),
      explanation: component(explanationClaim, explanation),
    },
  };
}

test("linked facts preserve actor-action relationships in natural MCQ wording", () => {
  const passage = "Rani collected shells. Mina crossed the bridge.";
  const collected = { ...fact({ claim: "Rani collected shells.", evidence: passage, actor: "Rani", actorPredicate: "Rani collected", predicate: "collected shells" }), id: "f1" };
  const crossed = { ...fact({ claim: "Mina crossed the bridge.", evidence: passage, actor: "Mina", actorPredicate: "Mina crossed", predicate: "crossed the bridge" }), id: "f2" };
  const faithful = linkedGroundedItem({
    questionText: "What did Rani collect, and what did Mina cross?",
    options: ["Shells and the bridge", "Coins and a road", "Leaves and a stream", "Books and a field"],
    explanation: "Rani collected shells, and Mina crossed the bridge.",
    facts: [collected, crossed],
    premiseClaim: "Rani collected shells and Mina crossed the bridge",
    answerClaim: "Rani collected shells and Mina crossed the bridge",
    explanationClaim: "Rani collected shells and Mina crossed the bridge",
  });
  assert.equal(analyzeTextbookGroundedTopicQuestions([faithful], passage).acceptedCount, 1);

  faithful.grounding.answer.claim = "Rani crossed the bridge";
  assert.equal(analyzeTextbookGroundedTopicQuestions([faithful], passage).rejectionCodes.unsupported_claim, 1);
});

test("ordered linked-fact assignment accepts overlapping support when every fact contributes", () => {
  const passage = "Rani collected shells. Rani collected white shells.";
  const general = { ...fact({ claim: "Rani collected shells.", evidence: passage, actor: "Rani", actorPredicate: "Rani collected", predicate: "collected shells" }), id: "f1" };
  const specific = { ...fact({ claim: "Rani collected white shells.", evidence: passage, actor: "Rani", actorPredicate: "Rani collected", predicate: "collected white shells" }), id: "f2" };
  const item = linkedGroundedItem({
    questionText: "Rani collected shells and Rani collected white shells?",
    options: ["Rani collected shells and Rani collected white shells", "Rani collected coins", "Rani collected leaves", "Rani collected nothing"],
    explanation: "Rani collected shells, and Rani collected white shells.",
    facts: [general, specific],
    premiseClaim: "Rani collected shells and Rani collected white shells",
    answerClaim: "Rani collected shells and Rani collected white shells",
    explanationClaim: "Rani collected shells and Rani collected white shells",
  });
  assert.equal(analyzeTextbookGroundedTopicQuestions([item], passage).acceptedCount, 1);
});

test("ordered linked-fact assignment rejects reversed overlapping support", () => {
  const passage = "Rani collected shells. Rani collected white shells.";
  const general = { ...fact({ claim: "Rani collected shells.", evidence: passage, actor: "Rani", actorPredicate: "Rani collected", predicate: "collected shells" }), id: "f1" };
  const specific = { ...fact({ claim: "Rani collected white shells.", evidence: passage, actor: "Rani", actorPredicate: "Rani collected", predicate: "collected white shells" }), id: "f2" };
  const reversed = linkedGroundedItem({
    questionText: "Rani collected white shells and Rani collected shells?",
    options: ["Rani collected white shells and Rani collected shells", "Rani collected coins", "Rani collected leaves", "Rani collected nothing"],
    explanation: "Rani collected white shells, and Rani collected shells.",
    facts: [general, specific],
    premiseClaim: "Rani collected white shells and Rani collected shells",
    answerClaim: "Rani collected white shells and Rani collected shells",
    explanationClaim: "Rani collected white shells and Rani collected shells",
  });
  assert.equal(analyzeTextbookGroundedTopicQuestions([reversed], passage).rejectionCodes.unsupported_claim, 1);
});

test("linked facts reject swapped quantities and speech attribution", () => {
  const quantityPassage = "Rani collected 3 shells. Mina collected 5 shells.";
  const raniCount = { ...fact({ claim: "Rani collected 3 shells.", evidence: quantityPassage, actor: "Rani", actorPredicate: "Rani collected", predicate: "collected 3 shells" }), id: "f1" };
  const minaCount = { ...fact({ claim: "Mina collected 5 shells.", evidence: quantityPassage, actor: "Mina", actorPredicate: "Mina collected", predicate: "collected 5 shells" }), id: "f2" };
  const quantities = linkedGroundedItem({
    questionText: "Did Rani collect 3 shells and Mina collect 5 shells?",
    options: ["Rani: 3 shells; Mina: 5 shells", "Rani: 5 shells; Mina: 3 shells", "Both: 3 shells", "Both: 5 shells"],
    explanation: "Rani collected 3 shells and Mina collected 5 shells.",
    facts: [raniCount, minaCount],
    premiseClaim: "Rani collected 3 shells and Mina collected 5 shells",
    answerClaim: "Rani collected 5 shells and Mina collected 3 shells",
    explanationClaim: "Rani collected 3 shells and Mina collected 5 shells",
  });
  assert.equal(analyzeTextbookGroundedTopicQuestions([quantities], quantityPassage).rejectionCodes.unsupported_claim, 1);
  quantities.grounding.answer.claim = "Rani collected 3 shells and Mina collected 5 shells";
  quantities.options[0] = "Mina: 5 shells; Rani: 3 shells";
  quantities.grounding.answer.displayText = quantities.options[0];
  assert.equal(analyzeTextbookGroundedTopicQuestions([quantities], quantityPassage).rejectionCodes.displayed_content_mismatch, 1);

  const speechPassage = '"Go," said Rani. "Stay," said Mina.';
  const raniSpeech = { ...fact({ claim: '"Go," said Rani.', evidence: speechPassage, actor: "Rani", actorPredicate: "said Rani", predicate: "Go", attribution: "Rani" }), id: "f1" };
  const minaSpeech = { ...fact({ claim: '"Stay," said Mina.', evidence: speechPassage, actor: "Mina", actorPredicate: "said Mina", predicate: "Stay", attribution: "Mina" }), id: "f2" };
  const speech = linkedGroundedItem({
    questionText: "What did Rani say and what did Mina say?",
    options: ['"Go" and "Stay"', '"Stay" and "Go"', '"Wait" and "Leave"', "Nobody spoke"],
    explanation: '"Go," said Rani, and "Stay," said Mina.',
    facts: [raniSpeech, minaSpeech],
    premiseClaim: "Rani said Go and Mina said Stay",
    answerClaim: '"Stay," said Rani, and "Go," said Mina',
    explanationClaim: '"Go," said Rani, and "Stay," said Mina',
  });
  assert.equal(analyzeTextbookGroundedTopicQuestions([speech], speechPassage).rejectionCodes.unsupported_claim, 1);
});

test("captured ellipsis predicates remain rejected", () => {
  const reply = "Mother said girls should learn. Mother was glad the teacher came.";
  const ellipsisFact = fact({ claim: reply, evidence: reply, actor: "Mother", actorPredicate: "Mother said", predicate: "girls should learn ... teacher came", attribution: "Mother" });
  const ellipsisItem = groundedItem({ questionText: reply, options: [reply, "No advice", "No teacher", "No school"], explanation: reply, fact: ellipsisFact });
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions([ellipsisItem], reply).rejectionCodes, { evidence_predicate_mismatch: 1 });
});

test("unattributed proposed events remain rejected", () => {
  const promise = '"If you come, we\'ll talk to your father," the teacher had said.';
  const promiseFact = fact({ claim: promise, evidence: promise, actor: "the teacher", actorPredicate: "the teacher had said", predicate: "If you come, we'll talk to your father", frame: "hypothetical", attribution: "the teacher" });
  const promiseItem = groundedItem({ questionText: promise, options: [promise, "The visit happened.", "The father refused.", "Nobody spoke."], explanation: promise, fact: promiseFact, treatment: "hypothetical" });
  assert.equal(analyzeTextbookGroundedTopicQuestions([promiseItem], promise).acceptedCount, 1);
  promiseItem.grounding.facts[0] = { ...promiseFact, claim: "The teacher talked to the father." };
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions([promiseItem], promise).rejectionCodes, { evidence_framing_mismatch: 1 });
  promiseItem.grounding.facts[0] = { ...promiseFact, attribution: null };
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions([promiseItem], promise).rejectionCodes, { evidence_attribution_mismatch: 1 });
});

test("a nearby speaker attribution cannot support a later sentence", () => {
  const nearbySpeech = '"Wait," said the River. "Go to school now."';
  const inferredSpeaker = fact({ claim: '"Go to school now," said the River.', evidence: nearbySpeech, actor: "the River", actorPredicate: "said the River", predicate: "Go to school now", attribution: "the River" });
  const inferredItem = groundedItem({ questionText: inferredSpeaker.claim, options: [inferredSpeaker.claim, "Stay home.", "The River left.", "Nobody spoke."], explanation: inferredSpeaker.claim, fact: inferredSpeaker });
  assert.deepEqual(analyzeTextbookGroundedTopicQuestions([inferredItem], nearbySpeech).rejectionCodes, { evidence_non_atomic_fact: 1 });
});

test("generation prompt requires server-owned source span references", () => {
  assert.match(route, /Select only supplied scope and token IDs/);
  assert.match(route, /actor range must be inside actorPredicateSpan/);
  assert.match(route, /Preserve source pronouns by selecting their token IDs/);
  assert.match(route, /<source_text>[\s\S]*<source_catalog>/);
});

test("generation and validation use only the selected curriculum-or-upload source", () => {
  assert.match(route, /const groundingSource = curriculum\?\.usable[\s\S]*suppliedEvidence\.usable/);
  assert.match(route, /const groundingPassage = groundingSource\?\.content/);
  assert.match(route, /\$\{groundingSource \? `\$\{groundingSource\.kind\}[\s\S]*<source_text>/);
  assert.match(route, /const resolvedCandidates = resolveTopicTestSourceSpans\(candidates, groundingCatalog, groundingPassage\);\s*const diagnostics = analyzeTextbookGroundedTopicQuestions\(resolvedCandidates, groundingPassage\)/);
  assert.doesNotMatch(route, /Trusted NeoLearn curriculum material[\s\S]*Server-verified extraction from a student-uploaded page/);
});
