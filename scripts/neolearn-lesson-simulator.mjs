const BASE_URL = process.env.NEOLEARN_BASE_URL || "http://localhost:3004";
const TEST_MOBILE = process.env.NEOLEARN_TEST_MOBILE || "9000000012";
const WITH_AUDIO = process.env.NEOLEARN_WITH_AUDIO === "1";

const classes = [6, 7, 8, 9, 10, 11, 12];

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

async function requestBinary(url, options = {}) {
  const res = await fetch(url, options);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "";
  return { ok: res.ok, status: res.status, buffer, contentType };
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

async function testClassLesson(classNumber) {
  console.log(`\nCLASS ${classNumber}`);
  console.log("-".repeat(40));

  const syllabusUrl = `${BASE_URL}/api/syllabus?board=cbse&class=${classNumber}`;
  const syllabusRes = await requestJson(syllabusUrl);

  if (!syllabusRes.ok) {
    console.log(`SYLLABUS => FAIL ${syllabusRes.status}`);
    return false;
  }

  const { subjects, chapters, topics } = getSyllabusArrays(syllabusRes.data);
  const item = pickFirstLessonItem(subjects, chapters, topics);

  if (!item) {
    console.log("PICK TOPIC => FAIL");
    console.log(`subjects=${subjects.length}, chapters=${chapters.length}, topics=${topics.length}`);
    return false;
  }

  const { subject, chapter, topic } = item;

  console.log(`PICKED => ${subject.subject_name} > ${chapter.chapter_name} > ${topic.topic_name}`);

  // 1) Generate lesson
  const lessonRes = await requestJson(`${BASE_URL}/api/generate-lesson`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      board: "CBSE",
      classLevel: `Class ${classNumber}`,
      subject: subject.subject_name,
      topic: topic.topic_name,
      language: "en",
    }),
  });

  if (!lessonRes.ok || !lessonRes.data?.ok || !lessonRes.data?.script) {
    console.log(`GENERATE LESSON => FAIL ${lessonRes.status}`);
    console.log(JSON.stringify(lessonRes.data, null, 2).slice(0, 1000));
    return false;
  }

  const script = String(lessonRes.data.script || "").trim();
  console.log(`GENERATE LESSON => OK | chars=${script.length}`);

  // 2) Save progress
  const progressRes = await requestJson(`${BASE_URL}/api/progress/topic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentMobile: TEST_MOBILE,
      studentName: "NeoLearn Test Student",
      board: "cbse",
      classNumber,
      subjectId: subject.id,
      chapterId: chapter.id,
      topicId: topic.id,
      score: null,
    }),
  });

  if (!progressRes.ok || !progressRes.data?.ok) {
    console.log(`PROGRESS SAVE => FAIL ${progressRes.status}`);
    console.log(JSON.stringify(progressRes.data, null, 2).slice(0, 1000));
    return false;
  }

  console.log(`PROGRESS SAVE => OK | status=${progressRes.data.status}`);

  // 3) Optional audio test
  if (WITH_AUDIO) {
    const audioRes = await requestBinary(`${BASE_URL}/api/lesson-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mobile: TEST_MOBILE,
        text: script.slice(0, 1200),
        language: "English",
        speed: "Normal",
      }),
    });

    if (audioRes.ok && audioRes.contentType.includes("audio")) {
      console.log(`LESSON AUDIO => OK | bytes=${audioRes.buffer.length}`);
    } else if (audioRes.status === 403) {
      console.log("LESSON AUDIO => CONTROLLED 403 | entitlement required");
    } else {
      console.log(`LESSON AUDIO => FAIL ${audioRes.status} | contentType=${audioRes.contentType}`);
      return false;
    }
  } else {
    console.log("LESSON AUDIO => SKIPPED | set NEOLEARN_WITH_AUDIO=1 to test");
  }

  return true;
}

async function main() {
  console.log("NeoLearn Lesson Start Simulator");
  console.log("===============================");
  console.log("BASE_URL:", BASE_URL);
  console.log("TEST_MOBILE:", TEST_MOBILE);
  console.log("WITH_AUDIO:", WITH_AUDIO);
  console.log("");

  const ready = await requestJson(`${BASE_URL}/api/system/ready`);
  console.log(`SYSTEM READY => ${ready.status} ${ready.ok ? "OK" : "FAIL"}`);
  if (!ready.ok) process.exit(1);

  let failed = 0;

  for (const cls of classes) {
    const ok = await testClassLesson(cls);
    if (!ok) failed++;
  }

  console.log("");
  console.log("RESULT:", failed === 0 ? "PASS" : `FAILURES=${failed}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Simulator crashed:", err);
  process.exit(1);
});
