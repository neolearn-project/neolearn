const BASE_URL = process.env.NEOLEARN_BASE_URL || "https://neolearn-ai.vercel.app";
const TEST_MOBILE = process.env.NEOLEARN_TEST_MOBILE || "9000000012";

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { ok: res.ok, status: res.status, data, raw: text };
}

function getSyllabusArrays(data) {
  const root = data?.data || {};
  return {
    subjects: Array.isArray(root.subjects) ? root.subjects : [],
    chapters: Array.isArray(root.chapters) ? root.chapters : [],
    topics: Array.isArray(root.topics) ? root.topics : [],
  };
}

function pickFirstLessonItem(subjects, chapters, topics) {
  for (const subject of subjects) {
    const chapter = chapters.find((c) => c.subject_id === subject.id);
    if (!chapter) continue;

    const topic = topics.find((t) => t.chapter_id === chapter.id);
    if (!topic) continue;

    return { subject, chapter, topic };
  }

  return null;
}

async function main() {
  console.log("NeoLearn Topic Test Simulator");
  console.log("=============================");
  console.log("BASE_URL:", BASE_URL);
  console.log("TEST_MOBILE:", TEST_MOBILE);
  console.log("");

  const ready = await requestJson(`${BASE_URL}/api/system/ready`);
  console.log(`SYSTEM READY => ${ready.status} ${ready.ok ? "OK" : "FAIL"}`);
  if (!ready.ok) process.exit(1);

  // Use Class 6 first valid topic
  const syllabusRes = await requestJson(`${BASE_URL}/api/syllabus?board=cbse&class=6`);
  if (!syllabusRes.ok) {
    console.log("SYLLABUS => FAIL", syllabusRes.status);
    process.exit(1);
  }

  const { subjects, chapters, topics } = getSyllabusArrays(syllabusRes.data);
  const item = pickFirstLessonItem(subjects, chapters, topics);

  if (!item) {
    console.log("PICK TOPIC => FAIL");
    process.exit(1);
  }

  const { subject, chapter, topic } = item;

  console.log(`PICKED => ${subject.subject_name} > ${chapter.chapter_name} > ${topic.topic_name}`);

  // Ensure topic_progress row exists before submit
  const progressRes = await requestJson(`${BASE_URL}/api/progress/topic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentMobile: TEST_MOBILE,
      studentName: "NeoLearn Test Student",
      board: "cbse",
      classNumber: 6,
      subjectId: subject.id,
      chapterId: chapter.id,
      topicId: topic.id,
      score: null,
    }),
  });

  if (!progressRes.ok || !progressRes.data?.ok) {
    console.log("PROGRESS PREP => FAIL", progressRes.status);
    console.log(JSON.stringify(progressRes.data, null, 2));
    process.exit(1);
  }

  console.log(`PROGRESS PREP => OK | status=${progressRes.data.status}`);

  // Generate topic test
  const testRes = await requestJson(`${BASE_URL}/api/topic-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mobile: TEST_MOBILE,
      studentMobile: TEST_MOBILE,
      board: "CBSE",
      classLevel: "Class 6",
      subject: subject.subject_name,
      chapter: chapter.chapter_name,
      topic: topic.topic_name,
      language: "en",
      numQuestions: 5,
    }),
  });

  if (testRes.status === 403) {
    console.log("TOPIC TEST => CONTROLLED 403 | entitlement required");
    console.log("RESULT: CONTROLLED_BLOCK");
    process.exit(0);
  }

  if (!testRes.ok || !testRes.data?.ok || !Array.isArray(testRes.data?.questions)) {
    console.log("TOPIC TEST => FAIL", testRes.status);
    console.log(JSON.stringify(testRes.data, null, 2).slice(0, 1500));
    process.exit(1);
  }

  const questions = testRes.data.questions;
  console.log(`TOPIC TEST => OK | questions=${questions.length}`);

  const validQuestions = questions.filter(
    (q) =>
      q.question &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      Number.isFinite(q.correctIndex)
  );

  if (validQuestions.length !== questions.length) {
    console.log(`QUESTION VALIDATION => FAIL | valid=${validQuestions.length}/${questions.length}`);
    process.exit(1);
  }

  console.log("QUESTION VALIDATION => OK");

  // Simulate a good score
  const score = 80;

  const submitRes = await requestJson(`${BASE_URL}/api/topic-test/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentMobile: TEST_MOBILE,
      topicId: topic.id,
      score,
    }),
  });

  if (!submitRes.ok || !submitRes.data?.ok) {
    console.log("TOPIC TEST SUBMIT => FAIL", submitRes.status);
    console.log(JSON.stringify(submitRes.data, null, 2).slice(0, 1500));
    process.exit(1);
  }

  console.log(
    `TOPIC TEST SUBMIT => OK | status=${submitRes.data.status}, testsTaken=${submitRes.data.testsTaken}, score=${submitRes.data.score}`
  );

  const daily = await requestJson(`${BASE_URL}/api/progress/daily-get?mobile=${encodeURIComponent(TEST_MOBILE)}`);
  const weekly = await requestJson(`${BASE_URL}/api/progress/weekly-get?mobile=${encodeURIComponent(TEST_MOBILE)}`);

  if (!daily.ok || !daily.data?.ok) {
    console.log("DAILY PROGRESS => FAIL", daily.status);
    console.log(JSON.stringify(daily.data, null, 2));
    process.exit(1);
  }

  if (!weekly.ok || !weekly.data?.ok) {
    console.log("WEEKLY PROGRESS => FAIL", weekly.status);
    console.log(JSON.stringify(weekly.data, null, 2));
    process.exit(1);
  }

  console.log(
    `DAILY PROGRESS => OK | topicsCompleted=${daily.data.topicsCompleted}, testsTaken=${daily.data.testsTaken}, avgScore=${daily.data.avgScore}`
  );

  const currentWeek = weekly.data.weeks?.[0] || {};
  console.log(
    `WEEKLY PROGRESS => OK | topicsCompleted=${currentWeek.topicsCompleted}, testsTaken=${currentWeek.testsTaken}, avgScore=${currentWeek.avgScore}`
  );

  if ((daily.data.testsTaken || 0) < 1) {
    console.log("RESULT: FAIL | daily testsTaken not increased");
    process.exit(1);
  }

  if ((currentWeek.testsTaken || 0) < 1) {
    console.log("RESULT: FAIL | weekly testsTaken not increased");
    process.exit(1);
  }

  console.log("");
  console.log("RESULT: PASS");
}

main().catch((err) => {
  console.error("Simulator crashed:", err);
  process.exit(1);
});
