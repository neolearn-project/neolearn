import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTextbookAiMappingInput,catalogFingerprint,TextbookAiMappingValidationError,textbookAiMappingOutputCounts,validateTextbookAiMapping } from "../app/lib/textbookAiMapping.mjs";

const source={id:"s",page_count:2,board:"CBSE",class_number:7,subject:"Science",book_name:"Book",edition:"2026"};
const pages=[{page_number:1,extracted_text:"Lesson One\nMatter is made of particles."},{page_number:2,extracted_text:"Changes of state happen with heat."}];
const subject={id:1,subject_name:"Science",chapters:[{id:2,chapter_name:"Matter",topics:[{id:3,topic_name:"Particle nature",is_active:true},{id:4,topic_name:"Inactive",is_active:false}]}]};

test("AI mapping input contains every complete page and active curriculum ID",()=>{
 const input=JSON.parse(buildTextbookAiMappingInput({source,pages,subject}));
 assert.deepEqual(input.pages.map(p=>p.pageNumber),[1,2]);assert.deepEqual(input.curriculum.chapters[0].topics.map(t=>t.id),[3]);
 assert.equal(catalogFingerprint(subject),catalogFingerprint({...subject,chapters:[...subject.chapters]}));
});

test("moving a topic between chapters in the same subject changes the catalog fingerprint",()=>{
 const secondChapter={id:5,chapter_name:"States",topics:[]};
 const before={...subject,chapters:[subject.chapters[0],secondChapter]};
 const moved={...subject,chapters:[{...subject.chapters[0],topics:[]},{...secondChapter,topics:[subject.chapters[0].topics[0]]}]};
 assert.notEqual(catalogFingerprint(before),catalogFingerprint(moved));
});

test("validated AI proposals require relationships, ranges, unique topics and verbatim evidence",()=>{
 const result=validateTextbookAiMapping({proposals:[{lessonTitle:"Lesson One",sectionTitle:"Particles",subjectId:1,chapterId:2,topicId:3,pageFrom:1,pageTo:2,evidence:[{pageNumber:1,text:"Matter is made of particles."}],reason:"The pages teach the particle model."}],unresolvedTopicIds:[]},{source,pages,subject});
 assert.equal(result.suggestions[0].topicId,3);assert.equal(result.suggestions[0].evidence[0].pageNumber,1);
 assert.throws(()=>validateTextbookAiMapping({proposals:[{lessonTitle:"Lesson One",sectionTitle:"Particles",subjectId:1,chapterId:2,topicId:3,pageFrom:1,pageTo:2,evidence:[{pageNumber:1,text:"invented quote"}],reason:"bad"}],unresolvedTopicIds:[]},{source,pages,subject}),/verbatim/);
});

test("AI mapping rejects incomplete pages and omitted active topics",()=>{
 assert.throws(()=>buildTextbookAiMappingInput({source,pages:pages.slice(1),subject}),/All extracted PDF pages/);
 assert.throws(()=>validateTextbookAiMapping({proposals:[],unresolvedTopicIds:[]},{source,pages,subject}),/omitted/);
});

test("AI mapping rejects negative, zero, fractional, and string-coerced IDs and ranges",()=>{
 const proposal=(overrides={})=>({lessonTitle:"Lesson One",sectionTitle:"Particles",subjectId:1,chapterId:2,topicId:3,pageFrom:1,pageTo:2,evidence:[{pageNumber:1,text:"Matter is made of particles."}],reason:"supported",...overrides});
 for(const overrides of [{pageFrom:-1},{pageFrom:0},{pageFrom:1.5},{pageFrom:"1"},{pageTo:"2"},{topicId:"3"},{evidence:[{pageNumber:"1",text:"Matter is made of particles."}]}])
  assert.throws(()=>validateTextbookAiMapping({proposals:[proposal(overrides)],unresolvedTopicIds:[]},{source,pages,subject}),/invalid|verbatim/i);
});

test("complete input is rejected against a conservative token budget before any provider call",()=>{
 const oversized=[{page_number:1,extracted_text:"x".repeat(400_000)},{page_number:2,extracted_text:"ok"}];
 assert.throws(()=>buildTextbookAiMappingInput({source,pages:oversized,subject}),/token budget/);
});

test("proposal validation exposes only allowlisted rejection codes and structural counts",()=>{
 const raw={proposals:[{lessonTitle:"Lesson One",sectionTitle:"Particles",subjectId:1,chapterId:2,topicId:3,pageFrom:0,pageTo:2,evidence:[{pageNumber:1,text:"Matter is made of particles."}],reason:"bad range"}],unresolvedTopicIds:[]};
 assert.deepEqual(textbookAiMappingOutputCounts(raw),{proposalCount:1,unresolvedCount:0,evidenceCount:1});
 assert.throws(()=>validateTextbookAiMapping(raw,{source,pages,subject}),error=>error instanceof TextbookAiMappingValidationError&&error.rejectionCode==="PAGE_RANGE"&&error.counts.proposalCount===1);
});

test("admin diagnostics distinguish safe failure stages and UI displays the returned code",async()=>{
 const [route,ui]=await Promise.all([readFile(new URL("../app/api/admin/textbooks/route.ts",import.meta.url),"utf8"),readFile(new URL("../app/admin/textbooks/page.tsx",import.meta.url),"utf8")]);
 for(const code of ["AI_MAPPING_PROVIDER_FAILED","AI_MAPPING_OUTPUT_INCOMPLETE","AI_MAPPING_JSON_INVALID","AI_MAPPING_PROPOSAL_INVALID","AI_MAPPING_FINALIZE_RPC","AI_MAPPING_FINALIZE_STALE"])assert.match(route,new RegExp(code));
 assert.match(route,/console\.error\("admin textbook AI mapping failure",\{stage,errorCode:code/);
 assert.doesNotMatch(route,/console\.error\([^\n]*(?:providerInput|outputText|response|claimError|storeError|error\b)/);
 assert.match(ui,/d\.errorCode[\s\S]*\[\$\{d\.errorCode\}\]/);
});
