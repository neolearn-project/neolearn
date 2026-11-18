import {normalizeStudentMobile} from "@/app/lib/studentLoginCore.mjs";
import {authBody,authFailure,authSuccess,studentOtpFlow} from "@/app/lib/studentOtpServer";
export async function POST(req:Request) {
 try {const b=await authBody(req),mobile=normalizeStudentMobile(b.parentMobile||b.mobile);return authSuccess(await studentOtpFlow().start({mobile,purpose:"parent_login",binding:"parent_login",request:req}));}
 catch(e){return authFailure(e);}
}
