import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  validatePassageTopicTestCandidates,
  validatePassageTopicTestReviews,
} from "../app/lib/topicTestContracts.mjs";

const route = await readFile(new URL("../app/api/topic-test/route.ts", import.meta.url), "utf8");

const refs = new Set(["scope_0001", "scope_0002"]);
const candidate = (id, overrides = {}) => ({
  id,
  question: `What does the passage establish in ${id}?`,
  options: ["The supported statement", "Distractor one", "Distractor two", "Distractor three"],
  correctIndex: 0,
  explanation: "The passage directly supports the selected statement.",
  sourceReferences: ["scope_0001"],
  ...overrides,
});
const accept = (item) => ({ id: item.id, decision: "accept", reasonCode: "accepted", candidate: item });
const reject = (item, reasonCode) => ({ id: item.id, decision: "reject", reasonCode, candidate: item });

test("passage candidate structure preserves multilingual text and rejects ambiguous shape and unknown provenance", () => {
  const bengali = candidate("bn-1", { question: "জাহ্নবী কী বলেছিল?", options: ["সে স্কুলে যেতে চেয়েছিল", "সে বাড়ি ফিরেছিল", "সে নদী দেখেছিল", "সে বই কিনেছিল"] });
  const result = validatePassageTopicTestCandidates([
    bengali,
    candidate("ambiguous", { options: ["same", " same ", "other", "fourth"] }),
    candidate("unknown-ref", { sourceReferences: ["model_claim_7"] }),
  ], refs);
  assert.deepEqual(result.accepted.map((item) => item.id), ["bn-1"]);
  assert.deepEqual(result.rejected.map((item) => item.reason), ["invalid_options", "invalid_source_references"]);
});

test("review fixtures reject parrot comparison, actor substitution, quantity, explanation and ambiguity mistakes", () => {
  const fixtures = [
    [candidate("parrot-comparison"), "negation_or_comparison"],
    [candidate("actor-substitution"), "actor_attribution"],
    [candidate("wrong-quantity"), "wrong_quantity"],
    [candidate("unsupported-explanation"), "explanation_error"],
    [candidate("ambiguous-distractors"), "ambiguous_options"],
  ];
  const candidates = fixtures.map(([item]) => item);
  const result = validatePassageTopicTestReviews(fixtures.map(([item, reason]) => reject(item, reason)), candidates, refs);
  assert.equal(result.accepted.length, 0);
  assert.deepEqual(result.rejected.map((item) => item.reason), fixtures.map(([, reason]) => reason));
});

test("valid passage reviews require all IDs and reject unknown, duplicated and omitted reviews", () => {
  const one = candidate("one");
  const two = candidate("two", { question: "Which second fact is directly supported?" });
  const result = validatePassageTopicTestReviews([
    accept(one),
    accept(one),
    accept(candidate("unknown")),
  ], [one, two], refs);
  assert.deepEqual(result.accepted.map((item) => item.id), ["one"]);
  assert.ok(result.rejected.some((item) => item.reason === "unknown_or_duplicate_review_id"));
  assert.ok(result.rejected.some((item) => item.id === "two" && item.reason === "missing_review_id"));
});

test("a corrected index is accepted only inside the complete reviewed candidate", () => {
  const wrong = candidate("corrected-index", { correctIndex: 0 });
  const corrected = { ...wrong, correctIndex: 2, explanation: "The passage supports distractor two after correction." };
  const result = validatePassageTopicTestReviews([accept(corrected)], [wrong], refs);
  assert.equal(result.accepted[0].correctIndex, 2);
  const incomplete = validatePassageTopicTestReviews([{ id: wrong.id, decision: "accept", reasonCode: "accepted", candidate: { id: wrong.id, correctIndex: 2 } }], [wrong], refs);
  assert.equal(incomplete.accepted.length, 0);
  assert.equal(incomplete.rejected[0].reason, "malformed_corrected_candidate");
});

test("Jahnavi review instructions preserve comparison scope, unsupported relationships and unresolved pronouns", () => {
  assert.match(route, /comparison-specific answer is Read, not Read and write/);
  assert.match(route, /do not call Meena her friend unless the selected source states that relationship/);
  assert.match(route, /preserve the unspecified pronoun; do not rewrite it as the other children/);
  assert.match(route, /Remove unsupported details in a complete corrected candidate, or reject when a reliable correction is unavailable/);
  assert.match(route, /Corrected sourceReferences must cover all corrected content/);
  assert.match(route, /clearly labelled as inference, uniquely answerable from the passage/);
});

test("complete Jahnavi corrections retain reviewer identity and corrected provenance", () => {
  const reading = candidate("jahnavi-reading", {
    question: "What did Jahnavi want to learn to do like Ettan and Meena?",
    options: ["Read and write", "Swim", "Sail", "Teach"],
    explanation: "She wanted to read and write like her brother Ettan and her friend Meena.",
  });
  const fear = candidate("jahnavi-fear", {
    question: "What did Jahnavi fear would happen at school?",
    options: ["The other children would scare her", "The River would leave", "Her mother would sail", "The teacher would hide"],
    explanation: "Jahnavi said that the other children would scare her and chase her out.",
    sourceReferences: ["scope_0002"],
  });
  const correctedReading = { ...reading, options: ["Read", "Swim", "Sail", "Teach"], explanation: "Jahnavi explicitly wanted to learn to read like Ettan and Meena." };
  const correctedFear = { ...fear, options: ["They would scare her and chase her out", "The River would leave", "Her mother would sail", "The teacher would hide"], explanation: "Jahnavi used the unspecified pronoun 'they' when describing this fear." };
  const result = validatePassageTopicTestReviews([accept(correctedReading), accept(correctedFear)], [reading, fear], refs);
  assert.equal(result.complete, true);
  assert.deepEqual(result.accepted, [correctedReading, correctedFear]);
});

test("complete reviewer correction keeps Jahnavi's observation attributed without changing identity, index or references", () => {
  const generated = candidate("jahnavi-fish-observation", {
    question: "What did Jahnavi hope education would help her understand?",
    options: ["Natural things like why little fishes become frogs", "How to sail a ship", "How to catch a kingfisher", "Why trains are quiet"],
    correctIndex: 0,
    explanation: "Jahnavi wanted to understand natural things like why fishes become frogs.",
    sourceReferences: ["scope_0002"],
  });
  const corrected = {
    ...generated,
    explanation: "Jahnavi wanted to investigate what she thought were little fish turning into frogs.",
  };
  const result = validatePassageTopicTestReviews([accept(corrected)], [generated], refs);
  assert.equal(result.complete, true);
  assert.equal(result.accepted[0].id, generated.id);
  assert.equal(result.accepted[0].correctIndex, generated.correctIndex);
  assert.deepEqual(result.accepted[0].sourceReferences, generated.sourceReferences);
  assert.equal(result.accepted[0].explanation, corrected.explanation);
});

// Passage review is a bounded model judgment, not a proof system. These fixtures
// use mocked reviews to verify protocol handling, not actual model accuracy or
// scientific/numerical truth.
