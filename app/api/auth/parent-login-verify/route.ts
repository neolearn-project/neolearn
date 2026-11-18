import {normalizeStudentMobile,StudentLoginError} from "@/app/lib/studentLoginCore.mjs";
import {authBody,authFailure,authSuccess,studentOtpFlow} from "@/app/lib/studentOtpServer";
import {ensureVerifiedParent,parentSessionResponse} from "@/app/lib/parentIdentityServer";
export async function POST(req:Request) {
 try {
  const b=await authBody(req),mobile=normalizeStudentMobile(b.parentMobile||b.mobile),name=String(b.parentName||"Parent").trim();
  if(!name||name.length>120)throw new StudentLoginError("Enter a valid parent name.");
  const id=await studentOtpFlow().verify({mobile,purpose:"parent_login",binding:"parent_login",otpToken:b.otpToken,otp:b.otp||b.code});
  return authSuccess(await parentSessionResponse(await ensureVerifiedParent(mobile,name,id)));
 }catch(e){return authFailure(e);}
}
