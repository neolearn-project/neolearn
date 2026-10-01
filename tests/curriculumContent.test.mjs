import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSubstantiveCurriculumContent,
  resolveCurriculumContent,
} from "../app/lib/curriculumContent.mjs";

function curriculumClient(rows) {
  return {
    from(table) {
      const filters = [];
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        order() { return query; },
        async limit() {
          if (table === "textbook_topic_mappings") return { data: null, error: { code: "42P01", message: "not migrated" } };
          return { data: [], error: null };
        },
        async maybeSingle() {
          const row = rows[table];
          const matches = row && filters.every(([key, value]) => row[key] === value);
          return { data: matches ? row : null, error: null };
        },
      };
      return query;
    },
  };
}

const passage = "Rina observes that equal pieces make comparison fair. She folds a paper into four equal parts and shades one part. ".repeat(3);
const rows = {
  subjects: { id: 10, board: "cbse", class_number: 6, subject_name: "Mathematics" },
  chapters: { id: 20, subject_id: 10, chapter_name: "Fractions" },
  topics: { id: 30, chapter_id: 20, topic_name: "Equal parts", content: { lessonText: passage }, is_active: true },
};

test("server curriculum lookup validates the full selection and versions substantive content", async () => {
  const found = await resolveCurriculumContent(curriculumClient(rows), { subjectId: 10, chapterId: 20, topicId: 30 });
  assert.equal(found.matched, true);
  assert.equal(found.usable, true);
  assert.equal(found.subject, "Mathematics");
  assert.match(found.version, /^[a-f0-9]{64}$/);

  const changed = await resolveCurriculumContent(curriculumClient({
    ...rows,
    topics: { ...rows.topics, content: { lessonText: `${passage} Another verified example.` } },
  }), { subjectId: 10, chapterId: 20, topicId: 30 });
  assert.notEqual(changed.version, found.version);

  const crossed = await resolveCurriculumContent(curriculumClient(rows), { subjectId: 11, chapterId: 20, topicId: 30 });
  assert.equal(crossed.usable, false);
  assert.equal(crossed.reason, "chapter_not_found");
});

test("labels and importer metadata are not substantive built-in material", async () => {
  assert.equal(extractSubstantiveCurriculumContent({ level: "basic" }), "");
  assert.equal(extractSubstantiveCurriculumContent({ topic_name: passage }), "");
  const labelsOnly = await resolveCurriculumContent(curriculumClient({
    ...rows,
    topics: { ...rows.topics, content: { level: "basic" } },
  }), { subjectId: 10, chapterId: 20, topicId: 30 });
  assert.equal(labelsOnly.matched, true);
  assert.equal(labelsOnly.usable, false);
  assert.equal(labelsOnly.reason, "labels_only");
});

test("opening and follow-up resolve the same published passage and replay identity", async () => {
  const published = "Jahnavi could not attend school because the school was far away. The River helped her travel to school safely. ".repeat(3);
  const records = {
    topics: rows.topics,
    chapters: rows.chapters,
    subjects: rows.subjects,
    textbook_topic_mappings: [{ page_from: 7, page_to: 7, source: {
      id: "published-source", version: 4, sha256: "c".repeat(64), status: "published",
      published_at: "2026-09-29", book_name: "Poorvi", edition: "2025",
    } }],
    textbook_pages: [{ source_id: "published-source", page_number: 7, extracted_text: published, review_status: "approved" }],
  };
  const client = { from(table) {
    let filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      order() { return query; },
      gte() { return query; },
      lte() { return query; },
      limit() {
        const data = records[table] || [];
        return Promise.resolve({ data: Array.isArray(data) ? data : [], error: null });
      },
      maybeSingle() {
        const row = records[table];
        return Promise.resolve({ data: row && filters.every(([key, value]) => row[key] === value) ? row : null, error: null });
      },
      then(resolve, reject) {
        const data = (records[table] || []).filter((row) => filters.every(([key, value]) => row[key] === value));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };

  const opening = await resolveCurriculumContent(client, { subjectId: 10, chapterId: 20, topicId: 30 });
  const followUp = await resolveCurriculumContent(client, { subjectId: 10, chapterId: 20, topicId: 30 });
  assert.equal(opening.reason, "published_textbook");
  assert.equal(followUp.content, opening.content);
  assert.equal(followUp.version, opening.version);
  assert.match(followUp.content, /Jahnavi could not attend school/);
  assert.match(followUp.version, /^textbook:published-source:v4:/);
});

test("curriculum lookup errors stay distinct from genuinely absent material", async () => {
  const failedClient = {
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() { return { data: null, error: { code: "42501", message: "lookup failed" } }; },
      };
      return query;
    },
  };
  const failed = await resolveCurriculumContent(failedClient, { subjectId: 10, chapterId: 20, topicId: 30 });
  assert.equal(failed.reason, "content_lookup_unavailable");
  assert.notEqual(failed.reason, "labels_only");
});
