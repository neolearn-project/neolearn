import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createSourceProvenance,
  inspectTextEvidence,
  isDirectLanguageExerciseQuestion,
  isSourceDependentLiterature,
  shortReplyContext,
  verifySourceProvenance,
} from "../app/lib/sourceGrounding.mjs";

const teacherRoute = await readFile(new URL("../app/api/teacher-math/route.ts", import.meta.url), "utf8");
const lessonRoute = await readFile(new URL("../app/api/generate-lesson/route.ts", import.meta.url), "utf8");
const testRoute = await readFile(new URL("../app/api/topic-test/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/student/page.tsx", import.meta.url), "utf8");

test("literature facts require source while general concepts remain available", () => {
  assert.equal(isSourceDependentLiterature({ subject: "English", chapter: "The Lost Child", topic: "Summary" }), true);
  assert.equal(isSourceDependentLiterature({ subject: "English", chapter: "Grammar", topic: "Past tense" }), false);
  assert.equal(isSourceDependentLiterature({ subject: "Science", chapter: "Light", topic: "Reflection" }), false);
});

test("titles and exercise sheets do not become story evidence", () => {
  assert.equal(inspectTextEvidence("The Lost Child").usable, false);
  const exercises = "Exercise: Answer the following questions.\n1. Why did Mina leave?\n2. Where did she go?\n3. Who helped her?\n4. What happened next?";
  assert.deepEqual(inspectTextEvidence(exercises).kind, "exercise_only");
  const passage = "Mina waited beside the old bridge while rain tapped on her blue umbrella. ".repeat(4);
  assert.equal(inspectTextEvidence(passage).usable, true);
});

test("short replies bind only to the immediately preceding teacher turn", () => {
  const history = [{ role: "user", content: "Explain fractions" }, { role: "assistant", content: "Would you like a number-line example?" }];
  assert.equal(shortReplyContext("Yes", history)?.teacherTurn, "Would you like a number-line example?");
  assert.equal(shortReplyContext("continue", history)?.teacherTurn, "Would you like a number-line example?");
  assert.equal(shortReplyContext("okay", [...history, { role: "user", content: "Wait" }]), null);
  assert.equal(shortReplyContext("Please explain thirds", history), null);
});

test("source provenance is server-signed and bound to student, topic, and exact content", async () => {
  const source = "The child waited beside the bridge. ".repeat(8);
  const binding = { studentId: "student-1", subject: "English", chapter: "A Journey", topic: "Story", content: source };
  const token = await createSourceProvenance(binding, "test-server-secret");
  assert.equal(await verifySourceProvenance(binding, token, "test-server-secret"), true);
  assert.equal(await verifySourceProvenance({ ...binding, studentId: "student-2" }, token, "test-server-secret"), false);
  assert.equal(await verifySourceProvenance({ ...binding, topic: "Another Story" }, token, "test-server-secret"), false);
  assert.equal(await verifySourceProvenance({ ...binding, content: `${source}changed` }, token, "test-server-secret"), false);
  assert.equal(await verifySourceProvenance(binding, token, "wrong-secret"), false);
});

test("exercise-only pages allow direct language work but not inferred story answers", () => {
  assert.equal(isDirectLanguageExerciseQuestion("What is the meaning of 'timid'?"), true);
  assert.equal(isDirectLanguageExerciseQuestion("Choose the correct verb for the blank"), true);
  assert.equal(isDirectLanguageExerciseQuestion("Why did the hero leave the village?"), false);
});

test("all literature generation paths use the source gate without changing ten-question tests", () => {
  for (const route of [teacherRoute, lessonRoute, testRoute]) {
    assert.match(route, /isSourceDependentLiterature/);
    assert.match(route, /SOURCE_REQUIRED|sourceRequiredResponse/);
  }
  assert.match(testRoute, /const numQuestions = NEW_TOPIC_TEST_QUESTION_COUNT/);
  assert.match(lessonRoute, /verifySourceProvenance/);
  assert.match(testRoute, /verifySourceProvenance/);
  assert.match(teacherRoute, /createSourceProvenance/);
  assert.match(lessonRoute, /resolveCurriculumContent/);
  assert.match(testRoute, /resolveCurriculumContent/);
  assert.match(teacherRoute, /resolveCurriculumContent/);
  assert.match(lessonRoute, /curriculumVersion/);
  assert.match(testRoute, /curriculumVersion/);
  assert.match(teacherRoute, /curriculumVersion/);
  assert.match(teacherRoute, /verifySourceProvenance/);
  assert.match(teacherRoute, /submittedSourceSha256/);
  assert.match(lessonRoute, /submittedSourceSha256/);
  assert.match(testRoute, /submittedSourceSha256/);
  assert.match(page, /sourceProvenance: groundedSourceProvenance \|\| undefined/);
  assert.match(page, /setGroundedSourceContent\(""\)/);
  assert.match(page, /setGroundedSourceProvenance\(""\)/);
  assert.match(page, /lessonRes\.status === 422[\s\S]*failure\?\.error/);
});
