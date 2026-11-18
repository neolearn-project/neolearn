import { normalizeStudentMobile, StudentLoginError } from "@/app/lib/studentLoginCore.mjs";
import { authBody, authFailure, authSuccess, studentOtpFlow } from "@/app/lib/studentOtpServer";
import { issueStudentSession, studentForMobile } from "@/app/lib/studentSessionServer";
export async function POST(req:Request) {
 try {
  const body=await authBody(req);const mobile=normalizeStudentMobile(body.mobile);
  const id=await studentOtpFlow().verify({mobile,purpose:"student_login",binding:"login",otpToken:body.otpToken,otp:body.otp});
  const current=await studentForMobile(mobile);
  if(!id||current?.id!==id)throw new StudentLoginError("Unable to log in with this OTP. Try password login.",401);
  return authSuccess(await issueStudentSession(id));
 }catch(e){return authFailure(e);}
}
