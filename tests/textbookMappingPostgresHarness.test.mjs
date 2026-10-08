import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const repository=fileURLToPath(new URL("../",import.meta.url)).replace(/[\\/]$/,"");
const image=process.env.NEOLEARN_TEXTBOOK_POSTGRES_IMAGE??"postgres:17";
const database="neolearn_textbook_fixture";
if(!/^postgres:[1-9][0-9]*$/.test(image))throw new Error(`NEOLEARN_TEXTBOOK_POSTGRES_IMAGE must match postgres:<numeric-major>; received ${JSON.stringify(image)}`);

const docker=(args)=>spawnSync("docker",args,{encoding:"utf8"});
function assertSucceeded(result,description){assert.equal(result.error,undefined,`${description}: ${result.error?.message||"spawn failed"}`);assert.equal(result.status,0,`${description}: ${result.stderr||result.stdout}`);return result.stdout;}
const psql=(container,args=[])=>docker(["exec",container,"psql","-X","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1",...args]);

function concurrentPsql(container,marker,sql){return new Promise(resolve=>{const child=spawn("docker",["exec",container,"psql","-X","-q","-A","-t","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1","-c",`set application_name='${marker}';set statement_timeout='20s';set lock_timeout='15s';${sql}`],{stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";child.stdout.setEncoding("utf8").on("data",chunk=>{stdout+=chunk});child.stderr.setEncoding("utf8").on("data",chunk=>{stderr+=chunk});child.on("error",error=>resolve({error,stdout,stderr,status:null}));child.on("close",status=>resolve({stdout,stderr,status}))})}

function holdBookLock(container){return new Promise((resolve,reject)=>{const child=spawn("docker",["exec","-i",container,"psql","-X","-A","-t","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1"],{stdio:["pipe","pipe","pipe"]});let stdout="",stderr="";const timeout=setTimeout(()=>reject(new Error(`book-lock barrier timed out: ${stderr||stdout}`)),10000);child.stdout.setEncoding("utf8").on("data",chunk=>{stdout+=chunk;if(stdout.includes("TEXTBOOK_LOCK_READY")){clearTimeout(timeout);resolve({child,stdout:()=>stdout,stderr:()=>stderr})}});child.stderr.setEncoding("utf8").on("data",chunk=>{stderr+=chunk});child.on("error",error=>{clearTimeout(timeout);reject(error)});child.stdin.write("begin;\nselect public.lock_textbook_book_identity('CBSE',8,'Science','Concurrency Book','2026');\nselect 'TEXTBOOK_LOCK_READY';\n")})}

async function releaseBookLock(barrier){await new Promise((resolve,reject)=>{barrier.child.once("close",status=>status===0?resolve():reject(new Error(`book-lock barrier failed: ${barrier.stderr()||barrier.stdout()}`)));barrier.child.stdin.end("commit;\n\\q\n")})}

async function waitForBlocked(container,marker,expected){for(let attempt=0;attempt<80;attempt+=1){const result=psql(container,["-A","-t","-c",`select count(*) from pg_catalog.pg_stat_activity where application_name='${marker}' and wait_event_type='Lock'`]);if(result.status===0&&Number(result.stdout.trim())===expected)return;await new Promise(resolve=>setTimeout(resolve,100))}assert.fail(`${expected} independent sessions did not block on the shared book lock`)}

test("textbook mapping migrations and concurrency on disposable PostgreSQL 17",{timeout:120000},async(t)=>{
  const container=`neolearn-textbook-${process.pid}-${randomBytes(6).toString("hex")}`;
  let barrier;
  try{
    assertSucceeded(docker(["run","--detach","--name",container,"-e","POSTGRES_USER=postgres","-e","POSTGRES_PASSWORD=fixture-password","-e",`POSTGRES_DB=${database}`,"--mount",`type=bind,source=${repository},target=/workspace,readonly`,image]),`start ${image} container`);
    let ready=false;for(let attempt=0;attempt<80;attempt+=1){const probe=docker(["exec",container,"psql","-X","-h","127.0.0.1","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1","-A","-t","-c","select 1"]);if(probe.status===0&&probe.stdout.trim()==="1"){ready=true;break}await new Promise(resolve=>setTimeout(resolve,250))}const startupLogs=ready?"":docker(["logs",container]);assert.equal(ready,true,`PostgreSQL did not become ready over TCP or answer SQL against ${database}.\n${startupLogs.stderr||startupLogs.stdout||startupLogs.error?.message||"No container startup logs were available."}`);
    const version=assertSucceeded(psql(container,["-A","-t","-c","show server_version"]),"read PostgreSQL version").trim();assert.match(version,/^17\./);t.diagnostic(`PostgreSQL server version: ${version} (${image})`);

    assertSucceeded(psql(container,["-f","/workspace/tests/postgres/textbookMapping.prerequisites.sql"]),"load isolated prerequisites");
    assertSucceeded(psql(container,["-f","/workspace/supabase/migrations/20260929_textbook_teaching_v1.sql"]),"apply textbook teaching migration");
    assertSucceeded(psql(container,["-f","/workspace/supabase/migrations/20261007_textbook_mapping_suggestion_identity.sql"]),"apply suggestion identity migration");
    assertSucceeded(psql(container,["-f","/workspace/supabase/migrations/20261008_textbook_ai_mapping_proposals.sql"]),"apply AI mapping proposal migration");
    assertSucceeded(psql(container,["-f","/workspace/tests/postgres/textbookMapping.behavior.sql"]),"verify textbook mapping behavior");
    assertSucceeded(psql(container,["-f","/workspace/tests/postgres/textbookAiMapping.behavior.sql"]),"verify AI mapping claim/cache behavior");
    const aiMarker=`textbook_ai_claim_${randomBytes(6).toString("hex")}`;
    const aiClaimSql=(token)=>`select outcome from public.claim_textbook_ai_mapping('30000000-0000-0000-0000-000000000001',1,repeat('c',64),1,2,public.textbook_catalog_fingerprint(2),'gpt-5-mini','concurrent-fixture','${token}',120)`;
    const [aiClaimA,aiClaimB]=await Promise.all([
      concurrentPsql(container,aiMarker,aiClaimSql("22222222-2222-4222-8222-222222222222")),
      concurrentPsql(container,aiMarker,aiClaimSql("33333333-3333-4333-8333-333333333333")),
    ]);
    assertSucceeded(aiClaimA,"first concurrent AI claim");assertSucceeded(aiClaimB,"second concurrent AI claim");
    assert.deepEqual([aiClaimA.stdout.trim(),aiClaimB.stdout.trim()].sort(),["claimed","in_progress"],"exactly one concurrent request owns the provider claim");
    const deniedCalls=[
      "select public.lock_textbook_book_identity('DENIED',1,'Denied','Denied','Denied')",
      "select public.create_textbook_source('ffffffff-ffff-ffff-ffff-ffffffffffff','DENIED',1,'Denied','Denied','Denied','denied.pdf','denied/denied.pdf',10)",
      "select public.save_textbook_mappings('10000000-0000-0000-0000-000000000001','[]'::jsonb,1,repeat('a',64),2)",
      "select public.claim_textbook_ai_mapping('30000000-0000-0000-0000-000000000001',1,repeat('c',64),1,2,repeat('a',64),'gpt-5-mini','denied','44444444-4444-4444-8444-444444444444',120)",
    ];
    for(const role of ["anon","authenticated"])for(const call of deniedCalls){const denied=psql(container,["-c",`set role ${role};${call}`]);assert.notEqual(denied.status,0,`${role} unexpectedly called ${call}`);assert.match(denied.stderr,/permission denied for function/i)}

    const marker=`textbook_lock_${randomBytes(6).toString("hex")}`;
    barrier=await holdBookLock(container);
    const save=concurrentPsql(container,marker,`set role service_role;select public.save_textbook_mappings('30000000-0000-0000-0000-000000000001','[{"subjectId":2,"chapterId":20,"topicId":200,"pageFrom":1,"pageTo":1}]'::jsonb,1,repeat('c',64),1)`);
    const replacement=concurrentPsql(container,marker,`set role service_role;select (public.create_textbook_source('30000000-0000-0000-0000-000000000002','CBSE',8,'Science','Concurrency Book','2026','replacement.pdf','concurrency/replacement.pdf',1000)).version`);
    try{await waitForBlocked(container,marker,2)}finally{await releaseBookLock(barrier);barrier=null}
    const [saveResult,replacementResult]=await Promise.all([save,replacement]);
    assertSucceeded(replacementResult,"serialized replacement creation");
    if(saveResult.status!==0)assert.match(saveResult.stderr,/stale because a replacement source version exists/i,"serialized save failed for an unexpected reason");
    const replacementVersion=assertSucceeded(psql(container,["-A","-t","-c","select version from public.textbook_sources where id='30000000-0000-0000-0000-000000000002'"]),"read serialized replacement version").trim();
    assert.equal(replacementVersion,"2");
    const published=assertSucceeded(psql(container,["-A","-t","-c",`select s.status||':'||p.extracted_text||':'||m.topic_id from public.textbook_sources s join public.textbook_pages p on p.source_id=s.id join public.textbook_topic_mappings m on m.source_id=s.id where s.id='20000000-0000-0000-0000-000000000001'`]),"verify published fixture remained unchanged").trim();
    assert.equal(published,"published:Published fixture:101");
  }finally{
    if(barrier){try{await releaseBookLock(barrier)}catch{}barrier=null}
    docker(["rm","--force",container]);
  }
});
