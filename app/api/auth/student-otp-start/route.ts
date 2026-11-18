import { normalizeStudentMobile } from "@/app/lib/studentLoginCore.mjs";
import { authBody, authFailure, authSuccess, studentOtpFlow } from "@/app/lib/studentOtpServer";
export async function POST(req:Request) {
 try {const body=await authBody(req);const mobile=normalizeStudentMobile(body.mobile);return authSuccess(await studentOtpFlow().start({mobile,purpose:"student_login",binding:"login",request:req}));}
 catch(e){return authFailure(e);}
}
