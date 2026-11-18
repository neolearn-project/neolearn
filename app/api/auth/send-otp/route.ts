import {normalizeStudentMobile} from "@/app/lib/studentLoginCore.mjs";
import {recoveryRole} from "@/app/lib/accountRecoveryCore.mjs";
import {authBody,authFailure,authSuccess,studentOtpFlow} from "@/app/lib/studentOtpServer";
export async function POST(req:Request) {
 try {const b=await authBody(req),mobile=normalizeStudentMobile(b.mobile),role=recoveryRole(b.role);const purpose=role+"_reset";
 return authSuccess(await studentOtpFlow().start({mobile,purpose,binding:purpose,request:req}));}
 catch(e){return authFailure(e);}
}
