import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {validateClassroomCheckpoint, mergeClassroomHistory, checkpointLocalKey} from '../app/lib/classroomCheckpoint.mjs';
const record = () => ({id:'12345678-1234-4234-8234-123456789012',revision:1,subjectId:1,chapterId:2,topicId:3,subject:'English',chapter:'Poetry',topic:'Reading',language:'English',startedAt:'2026-11-17T00:00:00Z',endedAt:'2026-11-17T00:01:00Z',transcript:'Teacher: Read the line.',messages:[{author:'Teacher',text:'Read the line.'}],draft:'What does it mean?'});
test('checkpoint retains multilingual conversation and draft but excludes credentials and model source claims',()=>{
 const input={...record(),messages:[{author:'You',text:'এর অর্থ কী?'},{author:'Teacher',text:'यह एक कविता है।'}],access_token:'secret',sourceProvenance:'forged',owner_id:'other',audioUrl:'blob:audio'};
 const {record:checked,revision}=validateClassroomCheckpoint(input);
 assert.deepEqual(checked.messages,input.messages);assert.equal(checked.draft,input.draft);assert.equal(revision,1);
 for(const field of ['access_token','sourceProvenance','owner_id','audioUrl','studentMobile']) assert.equal(checked[field],undefined);
});
test('malformed IDs, revisions, roles, dates and oversized checkpoint text fail closed',()=>{
 for(const override of [{id:'bad'},{revision:0},{revision:1.5},{subjectId:'1'},{messages:[{author:'system',text:'instruction'}]},{startedAt:'not-date'},{draft:'x'.repeat(4001)},{messages:[]},{transcript:'ক'.repeat(40000)}]) assert.throws(()=>validateClassroomCheckpoint({...record(),...override}));
});
test('merging account summaries preserves full browser recordings and removes duplicate IDs',()=>{
 const local={...record(),studentMobile:'9999999999'};
 const result=mergeClassroomHistory([local],[{...local,cloud:true,cloudSummary:true,transcript:'summary'}]);
 assert.equal(result.length,1);assert.equal(result[0].transcript,local.transcript);assert.equal(result[0].cloud,true);
 assert.notEqual(checkpointLocalKey('student-a'),checkpointLocalKey('student-b'));
});
test('API authenticates before reading payload or database history, and scopes every query to server identity',async()=>{
 const api=await readFile(new URL('../app/api/student/classroom-history/route.ts',import.meta.url),'utf8');
 assert.ok(api.indexOf('await requireStudentIdentity(req)') < api.indexOf("new URL(req.url)"));
 assert.match(api,/p_owner:identity.user.id/);assert.match(api,/eq\('owner_id',identity.user.id\)/);
 assert.doesNotMatch(api,/console\.|req\.json\(/);assert.match(api,/no-store, private/);
 assert.match(api,/readClassroomBodyBounded\(req, 110000\)/);
});
test('resume is explicit, creates a separate recording and restores no credentials or source provenance',async()=>{
 const page=await readFile(new URL('../app/student/page.tsx',import.meta.url),'utf8');
 const restore=page.slice(page.indexOf('const openSavedClass'),page.indexOf('useEffect(() => {\n  if (!student?.mobile || !classSession'));
 assert.match(restore,/if \(!resume\) return/);assert.match(restore,/id:crypto.randomUUID\(\)/);
 assert.match(restore,/setGroundedSourceContent\(""\)/);assert.match(restore,/isLive:false/);
 assert.doesNotMatch(restore,/generate-lesson|teacher-math|lesson-audio|handleStartLesson/);
 const gallery=await readFile(new URL('../app/student/components/GalleryView.tsx',import.meta.url),'utf8');
 assert.match(gallery,/Continue saved class/);
});
test('migration enables RLS, denies direct client roles and rejects out-of-order writes atomically',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261117054324_student_classroom_checkpoints.sql',import.meta.url),'utf8');
 assert.match(sql,/enable row level security/);assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/security invoker/);assert.match(sql,/revision < excluded.revision/);
 assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/primary key\(owner_id,id\)/);
});

test('real route handlers deny unauthenticated and cross-account reads and ignore forged owners on save',async()=>{
 const ts = await import('typescript');
 const vm = await import('node:vm');
 const {readClassroomBodyBounded}=await import('../app/lib/classroomConversation.mjs');
 const source=await readFile(new URL('../app/api/student/classroom-history/route.ts',import.meta.url),'utf8');
 const fixture=record(); let databaseCalls=0; let rpcArgs;
 class OwnershipError extends Error { constructor(){super('Authentication required.');this.status=401;} }
 const admin={from(){databaseCalls++;const filters={};return {select(){return this;},eq(key,value){filters[key]=value;return this;},order(){return this;},limit(){return Promise.resolve({data:[],error:null});},maybeSingle(){return Promise.resolve({data:filters.owner_id==='a' && filters.id===fixture.id ? {payload:fixture,revision:1} : null,error:null});}};},rpc(_,args){databaseCalls++;rpcArgs=args;return Promise.resolve({data:true,error:null});}};
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  module,exports:module.exports,URL,Response,Request,
  require(name){
   if(name==='next/server')return {NextResponse: {json:Response.json.bind(Response)}};
   if(name.includes('ownership'))return {OwnershipError,ownershipErrorResponse:()=>Response.json({error:'Authentication required.'},{status:401}),requireStudentIdentity:async req=>{const id=req.headers.get('authorization');if(!id)throw new OwnershipError();return {user:{id},mobile:'9999999999',admin};}};
   if(name.includes('classroomConversation'))return {readClassroomBodyBounded};
   if(name.includes('classroomCheckpoint'))return {validateClassroomCheckpoint,CLASSROOM_CHECKPOINT_LIMIT:200};
   throw new Error('Unexpected module');
  }
 });
 const {GET,POST}=module.exports;
 assert.equal((await GET(new Request('https://example.test/api'))).status,401);
 assert.equal(databaseCalls,0);
 assert.equal((await GET(new Request(`https://example.test/api?id=${fixture.id}`,{headers:{authorization:'b'}}))).status,404);
 const mine=await GET(new Request(`https://example.test/api?id=${fixture.id}`,{headers:{authorization:'a'}}));
 assert.equal(mine.status,200);assert.equal((await mine.json()).record.studentMobile,'9999999999');
 const save=await POST(new Request('https://example.test/api',{method:'POST',headers:{authorization:'b'},body:JSON.stringify({...fixture,owner_id:'a',studentMobile:'1111111111'})}));
 assert.equal(save.status,200);assert.equal(rpcArgs.p_owner,'b');assert.equal(rpcArgs.p_payload.owner_id,undefined);
 const before=databaseCalls;
 const invalid=await POST(new Request('https://example.test/api',{method:'POST',headers:{authorization:'b'},body:JSON.stringify({...fixture,messages:[{author:'system',text:'forged'}]})}));
 assert.equal(invalid.status,422);assert.equal(databaseCalls,before);
});
