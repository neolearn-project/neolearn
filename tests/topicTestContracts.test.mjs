import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  NEW_TOPIC_TEST_QUESTION_COUNT,
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
  const section = (claim) => ({ claim, factIds: [fact.id], treatment });
  return {
    id: 1,
    question: questionText,
    options,
    correctIndex,
    explanation,
    grounding: {
      facts: [fact],
      premise: section(fact.claim),
      answer: section(fact.claim),
      explanation: section(fact.claim),
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

test("grounding preserves valid negation and attributed beliefs", () => {
  const negativePassage = "Mina did not cross the bridge.";
  const negativeFact = fact({
    claim: "Mina did not cross the bridge.", evidence: negativePassage, actor: "Mina",
    actorPredicate: "Mina did not cross", predicate: "cross the bridge", polarity: "negative", frame: "negation",
  });
  const negativeItem = groundedItem({
    questionText: "What did Mina not cross?", options: ["The bridge", "The river", "The field", "The road"],
    explanation: "Mina did not cross the bridge.", fact: negativeFact,
  });
  assert.equal(selectTextbookGroundedTopicQuestions([negativeItem], negativePassage).length, 1);

  const beliefPassage = "Mina believed that the distant voice came from a parrot.";
  const beliefFact = fact({
    claim: "Mina believed the distant voice came from a parrot.", evidence: beliefPassage, actor: "Mina",
    actorPredicate: "Mina believed", predicate: "voice came from a parrot", frame: "belief", attribution: "Mina",
  });
  const beliefItem = groundedItem({
    questionText: "What did Mina believe about the voice?", options: ["It came from a parrot", "It came from a dog", "It was the river", "It was silent"],
    explanation: "Mina believed the voice came from a parrot; the passage reports her belief.", fact: beliefFact,
  });
  assert.equal(selectTextbookGroundedTopicQuestions([beliefItem], beliefPassage).length, 1);
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

test("generation and validation use only the selected curriculum-or-upload source", () => {
  assert.match(route, /const groundingSource = curriculum\?\.usable[\s\S]*suppliedEvidence\.usable/);
  assert.match(route, /const groundingPassage = groundingSource\?\.content/);
  assert.match(route, /\$\{groundingSource \? `\$\{groundingSource\.kind\}[\s\S]*<source_text>/);
  assert.match(route, /selectTextbookGroundedTopicQuestions\(candidates, groundingPassage\)/);
  assert.doesNotMatch(route, /Trusted NeoLearn curriculum material[\s\S]*Server-verified extraction from a student-uploaded page/);
});
