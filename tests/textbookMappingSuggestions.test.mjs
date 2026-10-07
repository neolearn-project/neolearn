import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateTextbookMappingSuggestions, mergeAcceptedSuggestions, normalizeHeading, suggestionIdentityMatches } from "../app/lib/textbookMappingSuggestions.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/textbook-mapping-suggestions.json", import.meta.url), "utf8"));

test("exact and conservative normalized headings map only existing curriculum IDs with PDF page boundaries", () => {
  const result = generateTextbookMappingSuggestions(fixture);
  assert.deepEqual(result.suggestions.slice(0, 2).map(item => [item.topicId, item.pageFrom, item.pageTo]), [[30, 4, 6], [31, 7, 9]]);
  assert.equal(result.suggestions[0].matchKind, "exact");
  assert.equal(normalizeHeading("2. TRY—AGAIN"), normalizeHeading("Try Again"));
  assert.deepEqual(result.suggestions[0].evidence, [{ pageNumber: 4, text: "The Day the River Spoke" }]);
  assert.ok(result.suggestions.every(item => [30,31,33,34].includes(item.topicId)));
});

test("ambiguous and chapter-only matches remain unresolved", () => {
  const result = generateTextbookMappingSuggestions(fixture);
  assert.match(result.unresolved.find(item => item.topicId === 32).reason, /chapter heading appears/i);
  assert.match(result.unresolved.find(item => item.topicId === 35).reason, /ambiguous/i);
  assert.match(result.unresolved.find(item => item.topicId === 36).reason, /ambiguous/i);
});

test("title mentions in prose and contents entries are not heading evidence", () => {
  const pages=[
    {pageNumber:1,layoutPreserved:true,text:"CONTENTS\nThe Day the River Spoke\n4"},
    {pageNumber:2,layoutPreserved:true,text:"In this introduction, The Day the River Spoke is mentioned in ordinary prose."},
  ];
  const result=generateTextbookMappingSuggestions({...fixture,pages});
  assert.equal(result.suggestions.some(item=>item.topicId===30),false);
  assert.match(result.unresolved.find(item=>item.topicId===30).reason,/no unique, strong topic heading/i);
});

test("flattened extraction without layout evidence remains unresolved", () => {
  const pages=[{pageNumber:4,layoutPreserved:false,text:"The Day the River Spoke opening text"}];
  const result=generateTextbookMappingSuggestions({...fixture,pages});
  assert.equal(result.suggestions.length,0);
});

test("same-page topic headings may share a PDF-page range", () => {
  const result = generateTextbookMappingSuggestions(fixture);
  const shared = result.suggestions.filter(item => item.topicId === 33 || item.topicId === 34);
  assert.deepEqual(shared.map(item => [item.pageFrom,item.pageTo]), [[10,10],[10,10]]);
});

test("acceptance preserves existing mappings for topics not selected", () => {
  const existing = [{subjectId:"10",chapterId:"20",topicId:"99",pageFrom:"2",pageTo:"3"},{subjectId:"10",chapterId:"20",topicId:"30",pageFrom:"1",pageTo:"1"}];
  const merged = mergeAcceptedSuggestions(existing,[{subjectId:10,chapterId:20,topicId:30,pageFrom:4,pageTo:6,selected:true},{subjectId:10,chapterId:20,topicId:31,pageFrom:7,pageTo:9,selected:false}]);
  assert.deepEqual(merged,[existing[0],{subjectId:"10",chapterId:"20",topicId:"30",pageFrom:"4",pageTo:"6"}]);
});

test("suggestion identity rejects identical-byte reprocessing and replacement versions", () => {
  const expected={sourceId:"source-v2",version:2,processingRevision:4,sha256:"a".repeat(64)};
  assert.equal(suggestionIdentityMatches(expected,{id:"source-v2",version:2,processing_revision:4,sha256:"a".repeat(64)},2),true);
  assert.equal(suggestionIdentityMatches(expected,{id:"source-v2",version:2,processing_revision:5,sha256:"a".repeat(64)},2),false);
  assert.equal(suggestionIdentityMatches(expected,{id:"source-v2",version:2,processing_revision:4,sha256:"b".repeat(64)},2),false);
  assert.equal(suggestionIdentityMatches(expected,{id:"source-v2",version:2,processing_revision:4,sha256:"a".repeat(64)},3),false);
});

test("accepted suggestions still pass through existing mapping and publication safeguards", async () => {
  const [route,migration]=await Promise.all([readFile(new URL("../app/api/admin/textbooks/route.ts",import.meta.url),"utf8"),readFile(new URL("../supabase/migrations/20260929_textbook_teaching_v1.sql",import.meta.url),"utf8")]);
  assert.match(route,/action === "save_mappings"[\s\S]*suggestionIdentityMatches[\s\S]*save_textbook_mappings/);
  assert.match(migration,/save_textbook_mappings[\s\S]*Invalid curriculum relationship or page range/);
  assert.match(migration,/publish_textbook_source[\s\S]*Every page in every mapped range must be present and explicitly approved/);
  assert.match(migration,/Partial replacement rejected/);
});

test("static SQL contract uses one book lock for replacement creation and suggestion save", async () => {
  const migration=await readFile(new URL("../supabase/migrations/20261007_textbook_mapping_suggestion_identity.sql",import.meta.url),"utf8");
  assert.match(migration,/create_textbook_source[\s\S]*lock_textbook_book_identity/);
  assert.match(migration,/save_textbook_mappings[\s\S]*lock_textbook_book_identity/);
  assert.match(migration,/processing_revision=processing_revision\+1/);
  assert.match(migration,/p_expected_processing_revision/);
  assert.match(migration,/revoke all on function public\.save_textbook_mappings\(uuid,jsonb,integer,text,integer\) from public,anon,authenticated/);
  // This is a static/mocked regression only. Actual blocking and serialization require a real PostgreSQL concurrency test.
});

test("static admin contract preserves per-identity work and acceptance identity across review", async () => {
  const [ui,processRoute]=await Promise.all([
    readFile(new URL("../app/admin/textbooks/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/admin/textbooks/process/route.ts",import.meta.url),"utf8"),
  ]);
  assert.match(ui,/workBySource/);
  assert.match(ui,/sourceWorkKey/);
  assert.match(ui,/action==="review"[\s\S]*setPages/);
  assert.match(ui,/suggestionSource:acceptedSuggestionSource/);
  assert.doesNotMatch(ui,/action==="save_mappings"&&suggestionSource/);
  assert.match(processRoute,/item\.hasEOL\?"\\n"/);
  assert.match(processRoute,/layoutPreserved:true/);
  // Static UI/source checks: browser state restoration and database concurrency still require separate runtime verification.
});
