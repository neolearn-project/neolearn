import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createStudentOtpFlow,normalizeStudentMobile,normalizeStudentSignup,signupBinding,storedStudentFromResponse} from "../app/lib/studentLoginCore.mjs";

function fixture(overrides={}) {
 const calls=[];
 const d={reserve:async()=>({id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}),resolveStudent:async()=>({id:"existing-user"}),checkSignup:async()=>{},
 send:async()=>{calls.push("send");return "VE"+"1".repeat(32);},attach:async(...args)=>calls.push(["attach",...args]),
 claim:async()=>({id:"challenge",provider_sid:"VE"+"1".repeat(32),target_user_id:"existing-user",lease:"lease"}),
 check:async()=>{calls.push("check");return true;},finish:async(_,ok)=>calls.push(ok?"consume":"release"),...overrides};
 return {flow:createStudentOtpFlow(d),calls};
}
const request={mobile:"9876543210",purpose:"student_login",binding:"login",request:new Request("https://example.test")};
const verification={...request,otpToken:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",otp:"123456"};

test("OTP login targets an existing account and exposes neither target ID nor provider SID",async()=>{
 const {flow,calls}=fixture();const result=await flow.start(request);
 assert.equal(result.otpToken,verification.otpToken);assert.equal(result.retryAfter,60);
 assert.equal(calls[0],"send");assert.deepEqual(calls[1],["attach",verification.otpToken,"VE"+"1".repeat(32),"existing-user"]);
 assert.ok(!JSON.stringify(result).includes("existing-user"));assert.ok(!JSON.stringify(result).includes("VE"));
});
test("unknown login mobile receives identical public shape without sending SMS or creating a user",async()=>{
 const known=fixture(),unknown=fixture({resolveStudent:async()=>null});
 assert.deepEqual(await unknown.flow.start(request),await known.flow.start(request));
 assert.equal(unknown.calls.includes("send"),false);assert.equal(unknown.calls[0][2],null);
});
test("successful OTP is consumed before the target account is returned",async()=>{
 const {flow,calls}=fixture();assert.equal(await flow.verify(verification),"existing-user");
 assert.deepEqual(calls,["check","consume"]);
});
test("wrong OTP releases the lease and returns no authenticated identity",async()=>{
 const {flow,calls}=fixture({check:async()=>false});
 await assert.rejects(flow.verify(verification),e=>e.status===401);assert.deepEqual(calls,["release"]);
});
test("provider outage releases the claim and never authenticates",async()=>{
 const {flow,calls}=fixture({check:async()=>{throw new Error("offline");}});
 await assert.rejects(flow.verify(verification),/offline/);assert.deepEqual(calls,["release"]);
});
test("failed consumption cannot return an identity even after provider approval",async()=>{
 const {flow}=fixture({finish:async()=>{throw new Error("stale owner");}});
 await assert.rejects(flow.verify(verification),/stale owner/);
});
test("invalid challenge or code never reaches the provider",async()=>{
 const {flow,calls}=fixture();
 for(const patch of [{otpToken:"+919876543210"},{otp:"1"},{otp:"12345x"}])await assert.rejects(flow.verify({...verification,...patch}));
 assert.deepEqual(calls,[]);
});
test("unknown-account challenge never checks a provider code",async()=>{
 const {flow,calls}=fixture({claim:async()=>({provider_sid:null})});
 await assert.rejects(flow.verify(verification),e=>e.status===401);assert.deepEqual(calls,["release"]);
});
test("signup binding locks identity and curriculum while excluding the password",()=>{
 const p=normalizeStudentSignup({name:"Student",mobile:"+919876543210",username:"student_1",password:"private-password",board:"CBSE",classId:"7"});
 assert.equal(p.mobile,"9876543210");assert.ok(!signupBinding(p).includes("private-password"));
 assert.notEqual(signupBinding(p),signupBinding({...p,mobile:"9876543211"}));
 assert.notEqual(signupBinding(p),signupBinding({...p,username:"other"}));
 assert.notEqual(signupBinding(p),signupBinding({...p,classId:"8"}));
 assert.equal(signupBinding(p),signupBinding({...p,password:"another-password"}));
});
test("mobile and signup input reject query injection and unsupported curriculum",()=>{
 assert.throws(()=>normalizeStudentMobile("123"));assert.throws(()=>normalizeStudentMobile("9876543210,phone.not.is.null"));
 const p={name:"Student",mobile:"9876543210",username:"student1",password:"secret1"};
 assert.throws(()=>normalizeStudentSignup({...p,username:"user,x.eq.1"}));assert.throws(()=>normalizeStudentSignup({...p,classId:"99"}));
});
test("profile-only signup response cannot become a local authenticated session",()=>{
 assert.throws(()=>storedStudentFromResponse({student:{user_id:"user"},ok:true}));
 const data={student:{user_id:"same-user",mobile:"9876543210",username:"student1",class_id:"7"},session:{access_token:"access",refresh_token:"refresh",expires_at:12345}};
 const saved=storedStudentFromResponse(data);assert.equal(saved.studentId,"same-user");assert.equal(saved.classId,"7");assert.equal(saved.refresh_token,"refresh");
});
test("retired signup endpoints cannot create a confirmed account",async()=>{
 for(const path of ["student-signup","student/register"]){
  const source=await readFile(new URL("../app/api/auth/"+path+"/route.ts",import.meta.url),"utf8");
  assert.doesNotMatch(source,/createUser|phone_confirm|supabaseAdmin/);
  assert.match(source,/status:410/);
 }
});
