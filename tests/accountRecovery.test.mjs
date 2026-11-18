import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {recoveryRole,parentLinkBinding,completeAccountRecovery} from "../app/lib/accountRecoveryCore.mjs";
import {createStudentOtpFlow} from "../app/lib/studentLoginCore.mjs";
test("recovery accepts explicit roles and rejects unrecognised roles",()=>{
 assert.equal(recoveryRole("parent"),"parent");assert.equal(recoveryRole(),"student");assert.throws(()=>recoveryRole("admin"));
});
test("password recovery consumes proof then updates only the current stored auth ID",async()=>{
 const calls=[];
 const result=await completeAccountRecovery({role:"student",mobile:"9876543210",otpToken:"ticket",otp:"123456",newPassword:" exact password ",
 flow:{verify:async args=>{calls.push(["verify",args.purpose,args.binding]);return "existing-id";}},
 resolve:async()=>({id:"existing-id"}),updatePassword:async(id,password)=>calls.push(["update",id,password])});
 assert.equal(result.ok,true);assert.deepEqual(calls,[["verify","student_reset","student_reset"],["update","existing-id"," exact password "]]);
});
test("parent reset cannot reuse a student reset purpose",async()=>{
 let args;
 await completeAccountRecovery({role:"parent",mobile:"9876543210",newPassword:"secret1",flow:{verify:async a=>{args=a;return "parent-id";}},resolve:async()=>({id:"parent-id"}),updatePassword:async()=>{}});
 assert.equal(args.purpose,"parent_reset");assert.equal(args.binding,"parent_reset");
});
test("identity changed or missing after OTP cannot change any password",async()=>{
 for(const current of [null,{id:"new-account"}]) {
  let changed=false;
  await assert.rejects(completeAccountRecovery({role:"student",mobile:"9876543210",newPassword:"secret1",flow:{verify:async()=>"original"},resolve:async()=>current,updatePassword:async()=>{changed=true;}}));
  assert.equal(changed,false);
 }
});
test("bad password does not burn an OTP attempt",async()=>{
 let checked=false;
 await assert.rejects(completeAccountRecovery({newPassword:"x",flow:{verify:async()=>{checked=true;}}}));
 assert.equal(checked,false);
});
test("guardian approval binding changes with student ID or parent name",()=>{
 const one=parentLinkBinding("student-one","Parent");
 assert.notEqual(one,parentLinkBinding("student-two","Parent"));assert.notEqual(one,parentLinkBinding("student-one","Different Parent"));assert.throws(()=>parentLinkBinding("id","x".repeat(121)));
});
test("known reset account sends OTP; unknown reset account does not",async()=>{
 for(const purpose of ["student_reset","parent_reset"]) {
  for(const known of [false,true]) {
   let sent=0;const flow=createStudentOtpFlow({reserve:async()=>({id:"ticket"}),resolveTarget:async()=>known?{id:"existing"}:null,send:async()=>{sent++;return "sid";},attach:async()=>{}});
   await flow.start({mobile:"9876543210",purpose,binding:purpose});assert.equal(sent,known?1:0);
  }
 }
});
test("new parent login and guardian invitation require SMS even without an existing parent account",async()=>{
 for(const purpose of ["guardian_link","parent_login"]) {
  let sent=0;const flow=createStudentOtpFlow({reserve:async()=>({id:"ticket"}),resolveTarget:async()=>null,send:async()=>{sent++;return "sid";},attach:async()=>{}});
  await flow.start({mobile:"9876543210",purpose,binding:"binding"});assert.equal(sent,1);
 }
});
test("unsupported OTP purpose cannot reserve budget or contact provider",async()=>{
 let reserved=false;const flow=createStudentOtpFlow({reserve:async()=>{reserved=true;}});
 await assert.rejects(flow.start({purpose:"admin_reset"}));assert.equal(reserved,false);
});
test("recovery and parent link implementation uses stable IDs, no user scans or unverified link fallback",async()=>{
 const reset=await readFile(new URL("../app/api/auth/reset-password/route.ts",import.meta.url),"utf8");
 const parent=await readFile(new URL("../app/lib/parentIdentityServer.ts",import.meta.url),"utf8");
 const link=await readFile(new URL("../app/api/student/link-parent/route.ts",import.meta.url),"utf8");
 assert.doesNotMatch(reset,/listUsers|createUser|verify-otp/);assert.match(reset,/updateUserById/);
 assert.doesNotMatch(parent,/listUsers/);assert.match(parent,/getUserById/);
 assert.match(link,/requireStudentIdentity/);assert.match(link,/approveProgressAccess!==true/);assert.match(link,/link_verified_parent/);
});
