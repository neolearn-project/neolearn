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
