import { supabaseAnon } from "@/app/lib/supabaseAnon";
import { authBody,authFailure,authSuccess } from "@/app/lib/studentOtpServer";
import { StudentLoginError } from "@/app/lib/studentLoginCore.mjs";
import { studentSessionResponse } from "@/app/lib/studentSessionServer";
export const dynamic="force-dynamic";
export async function POST(req:Request) {
 try {
  const body=await authBody(req);const username=String(body.username||"").trim().toLowerCase();const password=String(body.password||"");
  if(!/^[a-z0-9._-]{3,40}$/.test(username)||!password||password.length>128)throw new StudentLoginError("Enter your User ID and password.");
  const result=await supabaseAnon().auth.signInWithPassword({email:username+"@neolearn.in",password});
  if(result.error||!result.data.user||!result.data.session) {
   if(result.error && ![400,401,403].includes(Number(result.error.status)))throw new StudentLoginError("Unable to log in right now. Please try later.",503);
   throw new StudentLoginError("Invalid User ID or password.",401);
  }
  return authSuccess(await studentSessionResponse(result.data.user,result.data.session));
 }catch(e){return authFailure(e);}
}
