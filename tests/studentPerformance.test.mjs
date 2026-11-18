import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {exportNotesPdf} from '../app/lib/studentNotesPdf.mjs';
const require=createRequire(import.meta.url);
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function evaluate(source,overrides={}) {const module={exports:{}};vm.runInNewContext(compile(source),{module,exports:module.exports,require:name=>name in overrides?overrides[name]:require(name)});return module.exports;}

test('PDF export loads its dependency only for nonempty explicit work, preserving pagination and retry after load failure',async()=>{
 let loads=0;const operations=[];
 class FakePdf {
  internal={pageSize:{getWidth:()=>300,getHeight:()=>110}};
  setFont(){} setFontSize(){} text(value){operations.push(['text',value]);}
  splitTextToSize(text){assert.equal(text,'one\ntwo\nthree\nfour');return text.split('\n');}
  addPage(){operations.push(['page']);}save(name){operations.push(['save',name]);}
 }
 const loader=async()=>{loads++;return{jsPDF:FakePdf};};
 assert.equal(await exportNotesPdf(' ',loader),false);assert.equal(loads,0);
 await assert.rejects(exportNotesPdf('notes',async()=>{throw new Error('offline');}),/offline/);
 assert.equal(await exportNotesPdf('one\ntwo\nthree\nfour',loader),true);
 assert.equal(loads,1);assert.ok(operations.some(([kind])=>kind==='page'));
 assert.equal(operations.filter(([kind])=>kind==='save').length,1);
 assert.equal(operations.at(-1)[1],'NeoLearn_Notes.pdf');
});

test('extracted Gallery preserves full recording/resume controls and escapes transcript text without starting work',async()=>{
 const format=evaluate(await readFile(new URL('../app/lib/studentHistoryFormat.ts',import.meta.url),'utf8'));
 const source=await readFile(new URL('../app/student/components/GalleryView.tsx',import.meta.url),'utf8');
 const Gallery=evaluate(source,{'@/app/lib/studentHistoryFormat':format,'@/app/lib/studentNotesPdf.mjs':{exportNotesPdf:()=>{throw new Error('unexpected export');}}}).default;
 const record={id:'one',studentMobile:'9999999999',subject:'English',chapter:'Poem',topic:'Reading',language:'English',startedAt:'2026-11-17T00:00:00Z',endedAt:'2026-11-17T00:01:00Z',transcript:'বাংলা पाठ <script>unsafe</script>'};
 let calls=0;
 const props={sessions:[record],loading:false,error:null,selectedId:'one',setSelectedId:()=>calls++,noteType:'quick_revision',setNoteType:()=>calls++,notesMarkdown:'',notesLoading:false,notesError:null,onGenerateNotes:()=>calls++,onOpenSession:()=>calls++};
 const html=renderToStaticMarkup(React.createElement(Gallery,props));
 assert.match(html,/Continue saved class/);assert.match(html,/বাংলা पाठ/);assert.doesNotMatch(html,/<script>unsafe/);assert.equal(calls,0);
 const summary=renderToStaticMarkup(React.createElement(Gallery,{...props,sessions:[{...record,cloudSummary:true}]}));
 assert.match(summary,/Open full recording/);assert.doesNotMatch(summary,/Continue saved class/);assert.match(summary,/disabled=""/);
});

test('student entry reaches Gallery only through a lazy boundary and classroom tools share the bounded entitlement loader',async()=>{
 const page=await readFile(new URL('../app/student/page.tsx',import.meta.url),'utf8');
 const panel=await readFile(new URL('../app/student/components/GalleryPanel.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(page,/from ["']jspdf["']|function GalleryView/);
 assert.match(panel,/lazy\(\(\) => import\("\.\/GalleryView"\)\)/);
 assert.match(panel,/Retry history tools/);assert.match(panel,/Suspense fallback/);
 assert.match(page,/onLoadEntitlements=\{loadEntitlements\}/);
 assert.match(page,/const loadEntitlementsLocal = useCallback\(\(\) => onLoadEntitlements\(\)/);
});

test('leaving the Gallery during dependency loading prevents a late PDF download',async()=>{
 let resolve;let cancelled=false;let constructed=false;
 const pending=new Promise(r=>{resolve=r;});
 const work=exportNotesPdf('notes',()=>pending,()=>cancelled);
 cancelled=true;resolve({jsPDF:class {constructor(){constructed=true;}}});
 assert.equal(await work,false);assert.equal(constructed,false);
});

test('shared entitlement loader coalesces overlapping checks, refreshes settled results and ignores a rotated session',async()=>{
 const page=await readFile(new URL('../app/student/page.tsx',import.meta.url),'utf8');
 const source=page.slice(page.indexOf('const entitlementRequestsRef'),page.indexOf('const loadPlans'))+'\nmodule.exports = loadEntitlements;';
 const pending=[];const applied=[];let session='original';
 const module={exports:{}};
 vm.runInNewContext(compile(source),{module,exports:module.exports,Map,Promise,localStorage:{},student:{mobile:'9999999999'},useRef:value=>({current:value}),useCallback:fn=>fn,currentStudentSessionKey:()=>session,studentAuthHeaders:()=>({}),ClientAuthError:class extends Error{},loginAgainMessage:()=>'',setEntitlements:data=>applied.push(data),fetchClassroomResponse:()=>new Promise(resolve=>pending.push(resolve))});
 const load=module.exports;
 const first=load();const overlap=load();assert.equal(pending.length,1);
 pending[0](Response.json({ok:true,features:{lessonGeneration:true}}));await Promise.all([first,overlap]);assert.equal(applied.length,1);
 const old=load();assert.equal(pending.length,2);session='rotated';const next=load();assert.equal(pending.length,3);
 pending[1](Response.json({ok:true,old:true}));await old;assert.equal(applied.length,1);
 pending[2](Response.json({ok:true,fresh:true}));await next;assert.equal(applied.length,2);assert.equal(applied[1].fresh,true);
});
