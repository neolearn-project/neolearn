import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildTextbookAiMappingInput,buildTextbookEvidenceBlocks,catalogFingerprint,TEXTBOOK_AI_MAPPING_CONTRACT,TEXTBOOK_AI_MAPPING_MAX_OUTPUT_TOKENS,TextbookAiMappingValidationError,textbookAiMappingIncompleteDiagnostics,textbookAiMappingInstructions,textbookAiMappingOutputCounts,validateTextbookAiMapping } from "../app/lib/textbookAiMapping.mjs";
import { analyzeCapturedEvidence,isLocalTextbookAiCaptureEnabled,TEXTBOOK_AI_CAPTURE_DIR } from "../app/lib/textbookAiMappingCapture.mjs";

const source={id:"s",page_count:2,board:"CBSE",class_number:7,subject:"Science",book_name:"Book",edition:"2026"};
const pages=[{page_number:1,extracted_text:"Lesson One\nMatter is made of particles."},{page_number:2,extracted_text:"Changes of state happen with heat."}];
const subject={id:1,subject_name:"Science",chapters:[{id:2,chapter_name:"Matter",topics:[{id:3,topic_name:"Particle nature",is_active:true},{id:4,topic_name:"Inactive",is_active:false}]}]};

test("AI mapping input contains every complete page and active curriculum ID",()=>{
 const input=JSON.parse(buildTextbookAiMappingInput({source,pages,subject}));
 assert.deepEqual(input.pages.map(p=>p.pageNumber),[1,2]);assert.deepEqual(input.curriculum.chapters[0].topics.map(t=>t.id),[3]);
 assert.equal(input.pages[0].blocks.map(block=>block.text).join(""),pages[0].extracted_text);assert.equal(input.pages[0].blocks[0].id,"p0001-b0001");
 assert.equal(catalogFingerprint(subject),catalogFingerprint({...subject,chapters:[...subject.chapters]}));
});

test("moving a topic between chapters in the same subject changes the catalog fingerprint",()=>{
 const secondChapter={id:5,chapter_name:"States",topics:[]};
 const before={...subject,chapters:[subject.chapters[0],secondChapter]};
 const moved={...subject,chapters:[{...subject.chapters[0],topics:[]},{...secondChapter,topics:[subject.chapters[0].topics[0]]}]};
 assert.notEqual(catalogFingerprint(before),catalogFingerprint(moved));
});

test("server resolves stable evidence IDs to exact block text and owning PDF pages",()=>{
 const result=validateTextbookAiMapping({proposals:[{lessonTitle:"Lesson One",sectionTitle:"Particles",subjectId:1,chapterId:2,topicId:3,pageFrom:1,pageTo:2,evidenceIds:["p0001-b0001"],reason:"The pages teach the particle model."}],unresolvedTopicIds:[]},{source,pages,subject});
 assert.equal(result.suggestions[0].topicId,3);assert.deepEqual(result.suggestions[0].evidence,[{evidenceId:"p0001-b0001",pageNumber:1,text:pages[0].extracted_text}]);
 assert.deepEqual(buildTextbookEvidenceBlocks(pages),buildTextbookEvidenceBlocks(pages));
});

test("AI mapping rejects incomplete pages and marks omitted active topics unresolved server-side",()=>{
 assert.throws(()=>buildTextbookAiMappingInput({source,pages:pages.slice(1),subject}),/All extracted PDF pages/);
 const result=validateTextbookAiMapping({proposals:[],unresolvedTopicIds:[]},{source,pages,subject});assert.deepEqual(result.unresolved.map(item=>item.topicId),[3]);assert.equal(result.unresolved[0].resolution,"server_added_omission");assert.match(result.unresolved[0].reason,/server added it as unresolved/);
});

test("offline coverage keeps assessed unresolved topics distinct from server-added omissions",()=>{
 const coverageSubject={...subject,chapters:[{...subject.chapters[0],topics:[subject.chapters[0].topics[0],{id:5,topic_name:"Changes of state",is_active:true}]}]};
 const result=validateTextbookAiMapping({proposals:[],unresolvedTopicIds:[3]},{source,pages,subject:coverageSubject});
 assert.deepEqual(result.unresolved.map(item=>[item.topicId,item.resolution]),[[3,"assessed_unresolved"],[5,"server_added_omission"]]);
});

test("AI mapping rejects negative, zero, fractional, and string-coerced IDs and ranges",()=>{
 const proposal=(overrides={})=>({lessonTitle:"Lesson One",sectionTitle:"Particles",subjectId:1,chapterId:2,topicId:3,pageFrom:1,pageTo:2,evidenceIds:["p0001-b0001"],reason:"supported",...overrides});
 for(const overrides of [{pageFrom:-1},{pageFrom:0},{pageFrom:1.5},{pageFrom:"1"},{pageTo:"2"},{topicId:"3"}])
  assert.throws(()=>validateTextbookAiMapping({proposals:[proposal(overrides)],unresolvedTopicIds:[]},{source,pages,subject}),/invalid/i);
});

test("unknown, duplicate, and out-of-range evidence IDs are rejected without page reassignment",()=>{
 const proposal=(evidenceIds,pageFrom=1,pageTo=2)=>({lessonTitle:"Lesson One",sectionTitle:"Particles",subjectId:1,chapterId:2,topicId:3,pageFrom,pageTo,evidenceIds,reason:"supported"});
 for(const [raw,code] of [[proposal(["invented"]),"EVIDENCE_ID_UNKNOWN"],[proposal(["p0001-b0001","p0001-b0001"]),"EVIDENCE_ID_DUPLICATE"],[proposal(["p0002-b0001"],1,1),"EVIDENCE_ID_RANGE"]])assert.throws(()=>validateTextbookAiMapping({proposals:[raw],unresolvedTopicIds:[]},{source,pages,subject}),error=>error instanceof TextbookAiMappingValidationError&&error.rejectionCode===code);
});

test("complete input is rejected against a conservative token budget before any provider call",()=>{
 const oversized=[{page_number:1,extracted_text:"x".repeat(400_000)},{page_number:2,extracted_text:"ok"}];
 assert.throws(()=>buildTextbookAiMappingInput({source,pages:oversized,subject}),/token budget/);
});

test("offline budget reserves the same raised output cap used by the provider call",async()=>{
 assert.equal(TEXTBOOK_AI_MAPPING_MAX_OUTPUT_TOKENS,24_000);
 const [mapping,route]=await Promise.all([readFile(new URL("../app/lib/textbookAiMapping.mjs",import.meta.url),"utf8"),readFile(new URL("../app/api/admin/textbooks/route.ts",import.meta.url),"utf8")]);
 assert.match(mapping,/inputTokenUpperBound\+TEXTBOOK_AI_MAPPING_MAX_OUTPUT_TOKENS\+TEXTBOOK_AI_MAPPING_SAFETY_TOKENS/);
 assert.match(route,/max_output_tokens:TEXTBOOK_AI_MAPPING_MAX_OUTPUT_TOKENS/);
});

test("proposal validation exposes only allowlisted rejection codes and structural counts",()=>{
 const raw={proposals:[{lessonTitle:"Lesson One",sectionTitle:"Particles",subjectId:1,chapterId:2,topicId:3,pageFrom:0,pageTo:2,evidenceIds:["p0001-b0001"],reason:"bad range"}],unresolvedTopicIds:[]};
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

test("offline incomplete-output diagnostics expose only allowlisted categories and token counts",()=>{
 assert.deepEqual(textbookAiMappingIncompleteDiagnostics({status:"incomplete",incomplete_details:{reason:"max_output_tokens"},usage:{output_tokens:11987}}),{providerStatus:"incomplete",incompleteReason:"max_output_tokens",configuredOutputTokenLimit:TEXTBOOK_AI_MAPPING_MAX_OUTPUT_TOKENS,returnedOutputTokenCount:11987});
 assert.deepEqual(textbookAiMappingIncompleteDiagnostics({status:"provider-secret-status",incomplete_details:{reason:"provider-secret-reason"},usage:{output_tokens:"11987"},output_text:"private output"}),{providerStatus:"unknown",incompleteReason:"unknown",configuredOutputTokenLimit:TEXTBOOK_AI_MAPPING_MAX_OUTPUT_TOKENS,returnedOutputTokenCount:null});
});

test("incomplete-output logging passes sanitized diagnostics and never logs provider content",async()=>{
 const route=await readFile(new URL("../app/api/admin/textbooks/route.ts",import.meta.url),"utf8");
 assert.match(route,/AI_MAPPING_OUTPUT_INCOMPLETE[\s\S]*textbookAiMappingIncompleteDiagnostics\(response\)/);
 assert.doesNotMatch(route,/console\.error\([^\n]*(?:outputText|providerInput|response|incomplete_details|usage|apiKey)/);
});

test("offline prompt contract requires exhaustive per-topic assessment and server-owned evidence IDs",()=>{
 const instructions=textbookAiMappingInstructions();
 assert.equal(TEXTBOOK_AI_MAPPING_CONTRACT,"textbook-map-v4-compact-exhaustive");
 assert.match(instructions,/Individually assess every active topic/);assert.match(instructions,/Propose every supported active topic/);assert.match(instructions,/otherwise explicitly add its topic ID to unresolvedTopicIds/);assert.match(instructions,/do not return only a few lesson-level summaries or representative topics/);assert.match(instructions,/Multiple topic proposals may use the same pageFrom, pageTo, and evidenceIds/);assert.match(instructions,/server-owned blocks/);assert.match(instructions,/Never write evidence quotes or move an evidence ID to another page/);
 assert.match(instructions,/compact JSON only/);assert.match(instructions,/Do not repeat curriculum subject, chapter, or topic names/);assert.match(instructions,/unresolvedTopicIds must contain IDs only, with no reasons or prose/);assert.match(instructions,/reason to 200 characters or fewer/);
});

test("compact proposal reasons are enforced offline",()=>{
 const longReason="r".repeat(201);
 assert.throws(()=>validateTextbookAiMapping({proposals:[{lessonTitle:"Lesson One",sectionTitle:"Particles",subjectId:1,chapterId:2,topicId:3,pageFrom:1,pageTo:2,evidenceIds:["p0001-b0001"],reason:longReason}],unresolvedTopicIds:[]},{source,pages,subject}),error=>error instanceof TextbookAiMappingValidationError&&error.rejectionCode==="PROPOSAL_TEXT");
});

test("local evidence capture is opt-in, Vercel-disabled, and stored under a git-ignored root",async()=>{
 assert.equal(isLocalTextbookAiCaptureEnabled({NEOLEARN_LOCAL_TEXTBOOK_AI_CAPTURE:"1"}),true);
 assert.equal(isLocalTextbookAiCaptureEnabled({NEOLEARN_LOCAL_TEXTBOOK_AI_CAPTURE:"1",VERCEL:"1"}),false);
 assert.equal(isLocalTextbookAiCaptureEnabled({}),false);assert.equal(TEXTBOOK_AI_CAPTURE_DIR.startsWith(".local-diagnostics"),true);
 const ignore=await readFile(new URL("../.gitignore",import.meta.url),"utf8");assert.match(ignore,/^\.local-diagnostics\/$/m);
});

test("offline analyzer identifies the attempt and shows resolved evidence plus its cited page",()=>{
 const analysis=analyzeCapturedEvidence({captureVersion:2,captureFilename:"attempt.json",capturedAt:"2026-10-09T01:02:03.000Z",rejectionCode:"EVIDENCE_ID_RANGE",source:{id:"fixture"},pages:[{pageNumber:1,text:"Range one"},{pageNumber:2,text:"Exact OCR text\nwith a line break."}],proposals:{proposals:[{topicId:3,chapterId:2,pageFrom:1,pageTo:1,evidenceIds:["p0002-b0001"]}]}});
 assert.equal(analysis.captureFilename,"attempt.json");assert.equal(analysis.capturedAt,"2026-10-09T01:02:03.000Z");assert.equal(analysis.failureCount,1);assert.equal(analysis.failures[0].rejection,"EVIDENCE_ID_OUTSIDE_RANGE");assert.equal(analysis.failures[0].resolvedQuote,"Exact OCR text\nwith a line break.");assert.equal(analysis.failures[0].citedPageText,"Exact OCR text\nwith a line break.");
});

test("offline analyzer identifies proposal duplicates, unresolved duplicates, and cross-list overlap",()=>{
 const proposal=topicId=>({topicId,chapterId:2,pageFrom:1,pageTo:1,evidenceIds:["p0001-b0001"]});
 const analysis=analyzeCapturedEvidence({captureVersion:2,rejectionCode:"DUPLICATE_TOPIC",pages:[{pageNumber:1,text:"Evidence"}],proposals:{proposals:[proposal(3),proposal(3),proposal(5)],unresolvedTopicIds:[5,7,7]}});
 assert.deepEqual(analysis.proposalDuplicates,[{topicId:3,count:2,indexes:[0,1]}]);
 assert.deepEqual(analysis.unresolvedDuplicates,[{topicId:7,count:2,indexes:[1,2]}]);
 assert.deepEqual(analysis.proposalUnresolvedOverlap,[{topicId:5,proposalIndexes:[2],unresolvedIndexes:[0]}]);
 assert.deepEqual(analysis.failures.slice(0,3).map(item=>item.rejection),["DUPLICATE_PROPOSAL_TOPIC","DUPLICATE_UNRESOLVED_TOPIC","PROPOSAL_UNRESOLVED_OVERLAP"]);
});

test("duplicate validation failures are eligible for opt-in local capture without weakening rejection",async()=>{
 const route=await readFile(new URL("../app/api/admin/textbooks/route.ts",import.meta.url),"utf8");
 assert.match(route,/\["DUPLICATE_TOPIC","UNRESOLVED_TOPIC"\]\.includes\(validation\.rejectionCode\)/);
 const duplicate={lessonTitle:"Lesson",sectionTitle:"Section",subjectId:1,chapterId:2,topicId:3,pageFrom:1,pageTo:1,evidenceIds:["p0001-b0001"],reason:"supported"};
 assert.throws(()=>validateTextbookAiMapping({proposals:[duplicate,duplicate],unresolvedTopicIds:[]},{source,pages,subject}),error=>error instanceof TextbookAiMappingValidationError&&error.rejectionCode==="DUPLICATE_TOPIC");
});
