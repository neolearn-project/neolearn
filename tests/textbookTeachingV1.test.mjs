import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { neutralizeSourceText, resolvePublishedTextbookContent } from "../app/lib/textbookContent.mjs";
import { readStoredPdfInfo } from "../app/lib/textbookUploadMetadata.mjs";

function query(result){
  const q={select(){return q},eq(){return q},gte(){return q},lte(){return q},order(){return q},limit(){return Promise.resolve(result)},maybeSingle(){return Promise.resolve(result)},then(a,b){return Promise.resolve(result).then(a,b)}};return q;
}

test("published textbook resolver preserves page references and reports over-limit coverage instead of truncating",async()=>{
 const rows={
  topics:{data:{id:3,chapter_id:2,is_active:true}},chapters:{data:{id:2,subject_id:1}},
  textbook_topic_mappings:{data:[{page_from:4,page_to:5,source:{id:"source-1",version:2,sha256:"a".repeat(64),status:"published",published_at:"2026-09-29",book_name:"Poorvi",edition:"2025"}}]},
  textbook_pages:{data:[{page_number:4,extracted_text:"A".repeat(13000),review_status:"approved"},{page_number:5,extracted_text:"ignored",review_status:"extracted"}]},
 };
 const client={from(name){return query(rows[name]||{data:null})}};
 const value=await resolvePublishedTextbookContent(client,{subjectId:1,chapterId:2,topicId:3});
 assert.equal(value.sourceId,"source-1"); assert.match(value.replayIdentity,/source-1:v2/); assert.equal(value.state,"incomplete");
 assert.equal(value.reason,"textbook_coverage_incomplete");assert.deepEqual(value.availablePages,[4,5]);assert.ok(value.characterCount>12000);
});

test("published textbook resolver returns complete bounded pages and tombstones withdrawn publications",async()=>{
 const base={topics:{data:{id:3}},chapters:{data:{id:2}},textbook_pages:{data:[{page_number:4,extracted_text:"Passage text",review_status:"approved"}]}};
 const published={...base,textbook_topic_mappings:{data:[{page_from:4,page_to:4,source:{id:"s",version:1,sha256:"b".repeat(64),status:"published",published_at:"2026-09-29"}}]}};
 const value=await resolvePublishedTextbookContent({from(name){return query(published[name])}},{subjectId:1,chapterId:2,topicId:3});
 assert.equal(value.state,"published");assert.match(value.content,/\[Page 4\]\nPassage text/);
 const unreviewed={...published,textbook_pages:{data:[{page_number:4,extracted_text:"Passage text",review_status:"extracted"}]}};
 assert.equal((await resolvePublishedTextbookContent({from(name){return query(unreviewed[name])}},{subjectId:1,chapterId:2,topicId:3})).state,"incomplete");
 const withdrawn={...base,textbook_topic_mappings:{data:[{page_from:4,page_to:4,source:{id:"s",status:"unpublished",published_at:"2026-09-29"}}]}};
 const withdrawnValue=await resolvePublishedTextbookContent({from(name){return query(withdrawn[name])}},{subjectId:1,chapterId:2,topicId:3});
 assert.equal(withdrawnValue.state,"withdrawn");assert.notEqual(withdrawnValue.replayIdentity,value.replayIdentity);
 const draft={...base,textbook_topic_mappings:{data:[{page_from:4,page_to:4,source:{id:"d",status:"review",published_at:null}}]}};
 assert.equal((await resolvePublishedTextbookContent({from(name){return query(draft[name])}},{subjectId:1,chapterId:2,topicId:3})).state,"absent");
});

test("source text is sanitized and admin routes enforce auth and bounded retry lifecycle",async()=>{
 assert.equal(neutralizeSourceText("a\0b"),"ab");
 const [admin,process,preview,ui,migration,lesson,teacher,topic]=await Promise.all([
  readFile(new URL("../app/api/admin/textbooks/route.ts",import.meta.url),"utf8"),readFile(new URL("../app/api/admin/textbooks/process/route.ts",import.meta.url),"utf8"),
  readFile(new URL("../app/api/admin/textbooks/pdf/route.ts",import.meta.url),"utf8"),readFile(new URL("../app/admin/textbooks/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../supabase/migrations/20260929_textbook_teaching_v1.sql",import.meta.url),"utf8"),readFile(new URL("../app/api/generate-lesson/route.ts",import.meta.url),"utf8"),
  readFile(new URL("../app/api/teacher-math/route.ts",import.meta.url),"utf8"),readFile(new URL("../app/api/topic-test/route.ts",import.meta.url),"utf8")]);
 for(const route of [admin,process,preview]){assert.match(route,/requireAdmin\(req\)/);assert.ok(route.indexOf("requireAdmin(req)")<route.indexOf("supabaseAdmin()"));}
 assert.doesNotMatch(admin,/req\.formData/);assert.match(admin,/createSignedUploadUrl/);assert.match(admin,/finalize_upload/);assert.match(admin,/MAX_BYTES = 25 \* 1024 \* 1024/);
 assert.match(process,/MAX_PAGES=250/);assert.match(process,/checkpoint_textbook_page/);assert.match(process,/finalize_textbook_processing/);assert.match(migration,/processing_attempts < 5/);
 assert.match(process,/GlobalWorkerOptions\.workerSrc=pathToFileURL\(workerPath\)\.href/);assert.match(process,/resolve\(process\.cwd\(\),"node_modules\/pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs"\)/);
 const nextConfig=await readFile(new URL("../next.config.js",import.meta.url),"utf8");assert.match(nextConfig,/serverComponentsExternalPackages:[\s\S]*"pdfjs-dist"/);assert.match(nextConfig,/outputFileTracingIncludes:[\s\S]*"\.\/node_modules\/pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs"/);
 assert.match(migration,/publish_textbook_source/);assert.match(migration,/unpublish_textbook_source/);assert.match(migration,/status='unpublished'/);assert.match(admin,/version = Number/);
 assert.match(migration,/as restrictive/);assert.match(migration,/review_textbook_page/);assert.match(migration,/save_textbook_mappings/);assert.match(migration,/begin;/);assert.match(migration,/commit;/);
 const checkpoint=migration.slice(migration.indexOf("create or replace function public.checkpoint_textbook_page"),migration.indexOf("revoke all on function public.checkpoint_textbook_page"));
 const finalize=migration.slice(migration.indexOf("create or replace function public.finalize_textbook_processing"),migration.indexOf("revoke all on function public.finalize_textbook_processing"));
 assert.ok(checkpoint.indexOf("where id=p_source_id for update")<checkpoint.indexOf("v_status is distinct from 'processing'"));
 assert.ok(finalize.indexOf("where id=p_source_id for update")<finalize.indexOf("v_status is distinct from 'processing'"));
 assert.match(checkpoint,/p_meta is null/);assert.match(finalize,/p_sha256 is null/);assert.match(finalize,/v_updated <> 1 then raise exception/);
 assert.match(migration,/p\.review_status is distinct from 'approved'/);assert.match(migration,/generate_series\(m.page_from,m.page_to\)/);
 assert.match(migration,/candidate must cover every topic served by each source/);
 assert.match(migration,/order by s\.id for update/);
 assert.match(ui,/Only pages inside mapped ranges need approval/);assert.match(ui,/Add topic mapping/);assert.match(ui,/draft must also map every other topic/);
 assert.match(ui,/Verify and finalize upload/);assert.match(admin,/readStoredPdfInfo\(storedInfo\)/);assert.match(admin,/stored\.size !== expectedSize/);
 assert.match(preview,/createSignedUrl\(source\.storage_path,300\)/);assert.match(ui,/uploadToSignedUrl/);
 for(const route of [lesson,teacher,topic]){assert.match(route,/curriculumVersion/);assert.match(route,/source_text/);}
 assert.match(topic,/cannot support ten distinct questions/);
});

test("Storage info() accepts current and legacy shapes only when byte size and MIME agree",()=>{
 const current={size:12345,contentType:"application/pdf",metadata:{size:12345,mimetype:"application/pdf"}};
 assert.deepEqual(readStoredPdfInfo(current),{size:12345,contentType:"application/pdf"});
 assert.deepEqual(readStoredPdfInfo({metadata:{size:"12345",contentLength:12345,mimetype:"APPLICATION/PDF; charset=binary"}}),
  {size:12345,contentType:"application/pdf"});
 assert.equal(readStoredPdfInfo({size:12345,metadata:{size:12346,mimetype:"application/pdf"}}),null);
 assert.equal(readStoredPdfInfo({size:12345,contentType:"application/pdf",metadata:{mimetype:"application/octet-stream"}}),null);
 assert.equal(readStoredPdfInfo({size:"12.5",contentType:"application/pdf"}),null);
 assert.equal(readStoredPdfInfo({size:12345}),null);
 assert.equal(readStoredPdfInfo({size:12345,contentType:"application/octet-stream"}).contentType,"application/octet-stream");
});
