const BASE_URL = process.env.NEOLEARN_BASE_URL || "http://localhost:3004";

const expected = {
  6:  { books: 7,  chapters: 88,  topics: 1063 },
  7:  { books: 6,  chapters: 57,  topics: 909 },
  8:  { books: 6,  chapters: 80,  topics: 577 },
  9:  { books: 6,  chapters: 74,  topics: 259 },
  10: { books: 10, chapters: 82, topics: 1781 },
  11: { books: 24, chapters: 211, topics: 2179 },
  12: { books: 27, chapters: 182, topics: 2799 },
};

const classes = Object.keys(expected).map(Number);

async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
    raw: text,
  };
}

function extractFlat(data) {
  const root = data?.data || data || {};

  const subjects =
    Array.isArray(root.subjects) ? root.subjects :
    Array.isArray(data?.subjects) ? data.subjects :
    [];

  const chapters =
    Array.isArray(root.chapters) ? root.chapters :
    Array.isArray(data?.chapters) ? data.chapters :
    [];

  const topics =
    Array.isArray(root.topics) ? root.topics :
    Array.isArray(data?.topics) ? data.topics :
    [];

  return { subjects, chapters, topics };
}

function checkRelations(subjects, chapters, topics) {
  const subjectIds = new Set(subjects.map((s) => s.id));
  const chapterIds = new Set(chapters.map((c) => c.id));

  const orphanChapters = chapters.filter((c) => !subjectIds.has(c.subject_id));
  const orphanTopics = topics.filter((t) => !chapterIds.has(t.chapter_id));

  const firstSubject = subjects[0] || null;
  const firstChapter = firstSubject
    ? chapters.find((c) => c.subject_id === firstSubject.id)
    : null;
  const firstTopic = firstChapter
    ? topics.find((t) => t.chapter_id === firstChapter.id)
    : null;

  return {
    orphanChapters: orphanChapters.length,
    orphanTopics: orphanTopics.length,
    firstSubject,
    firstChapter,
    firstTopic,
  };
}

async function main() {
  console.log("NeoLearn Syllabus Flat Array Test");
  console.log("=================================");
  console.log("BASE_URL:", BASE_URL);
  console.log("");

  let failed = 0;

  const ready = await getJson(`${BASE_URL}/api/system/ready`);
  console.log(`SYSTEM READY => ${ready.status} ${ready.ok ? "OK" : "FAIL"}`);
  if (!ready.ok) failed++;

  console.log("");

  for (const cls of classes) {
    const url = `${BASE_URL}/api/syllabus?board=cbse&class=${cls}`;
    const r = await getJson(url);

    if (!r.ok) {
      console.log(`CLASS ${cls} => ${r.status} FAIL`);
      failed++;
      continue;
    }

    const { subjects, chapters, topics } = extractFlat(r.data);
    const rel = checkRelations(subjects, chapters, topics);
    const e = expected[cls];

    const pass =
      subjects.length === e.books &&
      chapters.length === e.chapters &&
      topics.length === e.topics &&
      rel.orphanChapters === 0 &&
      rel.orphanTopics === 0 &&
      !!rel.firstSubject &&
      !!rel.firstChapter &&
      !!rel.firstTopic;

    console.log(
      `CLASS ${cls} => ${pass ? "OK" : "FAIL"} | books=${subjects.length}/${e.books}, chapters=${chapters.length}/${e.chapters}, topics=${topics.length}/${e.topics}, orphanChapters=${rel.orphanChapters}, orphanTopics=${rel.orphanTopics}`
    );

    if (rel.firstSubject && rel.firstChapter && rel.firstTopic) {
      console.log(
        `  sample: ${rel.firstSubject.subject_name} -> ${rel.firstChapter.chapter_name} -> ${rel.firstTopic.topic_name}`
      );
    }

    if (!pass) {
      failed++;
      console.log("  Response sample:");
      console.log(JSON.stringify(r.data, null, 2).slice(0, 1500));
    }
  }

  console.log("");
  console.log("RESULT:", failed === 0 ? "PASS" : `FAILURES=${failed}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});



