export const NEW_TOPIC_TEST_QUESTION_COUNT = 10;

export function topicTestQuestionSignature(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 16)
    .join(" ");
}

export function selectValidDistinctTopicQuestions(questions, count = NEW_TOPIC_TEST_QUESTION_COUNT) {
  const result = [];
  const seen = new Set();
  for (const question of Array.isArray(questions) ? questions : []) {
    const options = Array.isArray(question?.options) ? question.options.map((option) => String(option).trim()) : [];
    const signature = topicTestQuestionSignature(question?.question);
    const optionKeys = options.map((option) => option.toLowerCase().replace(/\s+/g, " "));
    if (!signature || seen.has(signature) || options.length !== 4 || new Set(optionKeys).size !== 4
        || !Number.isInteger(question?.correctIndex) || question.correctIndex < 0 || question.correctIndex >= 4) continue;
    seen.add(signature);
    result.push({ ...question, id: result.length + 1, options });
    if (result.length === count) break;
  }
  return result;
}

export function scoreTopicTest(questions, answers) {
  const valid = selectValidDistinctTopicQuestions(questions, Number.MAX_SAFE_INTEGER);
  const correct = valid.reduce((total, question) => total + (answers?.[question.id] === question.correctIndex ? 1 : 0), 0);
  return { correct, total: valid.length, percent: valid.length ? Math.round((correct / valid.length) * 100) : 0 };
}
