import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeStudentSignup, signupBinding, StudentLoginError } from "./studentLoginCore.mjs";
import { authBody,authFailure,authSuccess,studentOtpFlow } from "./studentOtpServer";
import { issueStudentSession } from "./studentSessionServer";
export async function startStudentSignup(req:Request) {
 try {
  const p=normalizeStudentSignup(await authBody(req));
  return authSuccess(await studentOtpFlow().start({mobile:p.mobile,purpose:"student_signup",binding:signupBinding(p),request:req}));
 }catch(e){return authFailure(e);}
}
export async function verifyStudentSignup(req:Request) {
 try {
  const body=await authBody(req);const p=normalizeStudentSignup(body);
  await studentOtpFlow().verify({mobile:p.mobile,purpose:"student_signup",binding:signupBinding(p),otpToken:body.otpToken,otp:body.otp});
  const admin=supabaseAdmin();
  const created=await admin.auth.admin.createUser({email:p.username+"@neolearn.in",password:p.password,email_confirm:true,user_metadata:{role:"student",username:p.username,name:p.name,mobile:p.mobile,classId:p.classId,board:p.track==="competitive"?p.competitiveExam:p.board,track:p.track,competitiveExam:p.competitiveExam,country:p.country,preferredLanguage:p.language}});
  if(created.error||!created.data.user)throw new StudentLoginError("Unable to create this account. The User ID may already be registered. Please try login.",409);
  const id=created.data.user.id;
  const {password,...profile}=p;
  const saved=await admin.rpc("register_verified_student",{p_user_id:id,p_profile:profile});
  if(saved.error) {
   // Delete only this newly created, still-unlinked Auth user, never an existing account.
   // If the outcome cannot be established, retain it for support/recovery.
   const probe=await admin.from("students").select("id").eq("user_id",id).limit(1);
   if(!probe.error&&!probe.data?.length)await admin.auth.admin.deleteUser(id);
   throw new StudentLoginError("Account setup could not finish. Please retry signup or contact support.",503);
  }
  // Profile creation is committed. A session-service outage must not delete this account.
  try {return authSuccess(await issueStudentSession(id),201);}
  catch {return authSuccess({ok:true,accountCreated:true,requiresLogin:true,message:"Your account is ready. Please log in to open your classroom."},201);}
 }catch(e){return authFailure(e);}
}
