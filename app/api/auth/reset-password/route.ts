import {normalizeStudentMobile,StudentLoginError} from "@/app/lib/studentLoginCore.mjs";
import {completeAccountRecovery,recoveryRole} from "@/app/lib/accountRecoveryCore.mjs";
import {authBody,authFailure,authSuccess,studentOtpFlow} from "@/app/lib/studentOtpServer";
import {studentForMobile} from "@/app/lib/studentSessionServer";
import {parentForMobile} from "@/app/lib/parentIdentityServer";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
export async function POST(req:Request) {
 try {
  const b=await authBody(req),mobile=normalizeStudentMobile(b.mobile),role=recoveryRole(b.role||b.mode);
  return authSuccess(await completeAccountRecovery({flow:studentOtpFlow(),mobile,role,otpToken:b.otpToken,otp:b.otp,newPassword:b.newPassword,
   resolve:(r:string,m:string)=>r==="student"?studentForMobile(m):parentForMobile(m),
   updatePassword:async(id:string,password:string)=>{const result=await supabaseAdmin().auth.admin.updateUserById(id,{password});if(result.error)throw new StudentLoginError("Unable to update the password. Request a new OTP and try again.",503);}
  }));
 }catch(e){return authFailure(e);}
}
