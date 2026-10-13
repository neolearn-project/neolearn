import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { eligiblePublishedTextbooks } from "../app/lib/studentTextbookAccess.mjs";

const student = { board: "CBSE", classNumber: 6 };
const subject = { board: "cbse", class_number: 6, subject_name: "Science" };
const source = {
  id: "published",
  board: "CBSE",
  class_number: 6,
  subject: "Science",
  book_name: "Curiosity",
  edition: "2026",
  storage_path: "private/curiosity.pdf",
  status: "published",
  published_at: "2026-10-01",
  unpublished_at: null,
};

test("student textbook access accepts only the authenticated curriculum and published sources", () => {
  const mappings = [
    { page_from: 12, source },
    { page_from: 1, source: { ...source, id: "draft", status: "review", published_at: null } },
    { page_from: 1, source: { ...source, id: "withdrawn", status: "unpublished", unpublished_at: "2026-10-02" } },
    { page_from: 1, source: { ...source, id: "other-class", class_number: 7 } },
    { page_from: 1, source: { ...source, id: "other-subject", subject: "Mathematics" } },
  ];
  assert.deepEqual(eligiblePublishedTextbooks({ mappings, student, subject }), [
    {
      id: "published",
      title: "Curiosity",
      edition: "2026",
      storagePath: "private/curiosity.pdf",
      page: 12,
      publishedAt: "2026-10-01",
    },
  ]);
});

test("student textbook access rejects a forged board or class before considering mappings", () => {
  const mappings = [{ page_from: 12, source }];
  assert.deepEqual(eligiblePublishedTextbooks({ mappings, student: { board: "ICSE", classNumber: 6 }, subject }), []);
  assert.deepEqual(eligiblePublishedTextbooks({ mappings, student: { board: "CBSE", classNumber: 7 }, subject }), []);
});

test("student textbook endpoint authenticates before private delivery and accepts curriculum ids only", async () => {
  const route = await readFile(new URL("../app/api/student/textbooks/route.ts", import.meta.url), "utf8");
  assert.ok(route.indexOf("requireStudentIdentity(req)") < route.indexOf('createSignedUrl(book.storagePath'));
  assert.match(route, /SIGNED_URL_SECONDS = 90/);
  assert.match(route, /source\.status !== "published"|eligiblePublishedTextbooks/);
  assert.doesNotMatch(route, /searchParams\.get\("(?:sourceId|storagePath)"\)/);
});
