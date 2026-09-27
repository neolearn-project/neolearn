import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  NEW_TOPIC_TEST_QUESTION_COUNT,
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
