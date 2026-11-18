import {createHash} from "node:crypto";
import {requireStudentIdentity,OwnershipError,ownershipErrorResponse} from "@/lib/auth/ownership";
import {normalizeStudentMobile,StudentLoginError} from "@/app/lib/studentLoginCore.mjs";
import {parentLinkBinding} from "@/app/lib/accountRecoveryCore.mjs";
import {authBody,authFailure,authSuccess,studentOtpFlow} from "@/app/lib/studentOtpServer";
import {ensureVerifiedParent} from "@/app/lib/parentIdentityServer";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
export async function POST(req:Request) {
 try {
  const identity=await requireStudentIdentity(req),b=await authBody(req);
  if(b.studentMobile&&normalizeStudentMobile(b.studentMobile)!==identity.mobile)throw new OwnershipError("Student access denied.",403);
  const mobile=normalizeStudentMobile(b.parentMobile),name=String(b.parentName||"Parent").trim();
  const binding=parentLinkBinding(identity.user.id,name);
  if(b.action==="start")return authSuccess(await studentOtpFlow().start({mobile,purpose:"guardian_link",binding,request:req}));
  if(b.action!=="verify"||b.approveProgressAccess!==true)throw new StudentLoginError("Parent approval and OTP verification are required.");
  const expectedId=await studentOtpFlow().verify({mobile,purpose:"guardian_link",binding,otpToken:b.otpToken,otp:b.otp});
  const parent=await ensureVerifiedParent(mobile,name,expectedId);
  const saved=await identity.admin.rpc("link_verified_parent",{p_student_id:identity.user.id,p_parent_user_id:parent.id,p_parent_mobile:mobile,p_parent_name:name,p_proof_id:b.otpToken,p_mobile_hash:hash(mobile),p_binding_hash:hash(binding),p_learning:{track:identity.user.user_metadata?.track||"regular",board:identity.user.user_metadata?.track==="competitive"?(identity.user.user_metadata?.competitiveExam||identity.user.user_metadata?.board):identity.user.user_metadata?.board||"CBSE",language:identity.user.user_metadata?.preferredLanguage||"English"}});
  if(saved.error)throw new StudentLoginError(String(saved.error.message||"").includes("PARENT_LINK_CONFLICT")?"A different parent is already linked. Contact support to change it.":"Unable to save the verified link. Please request a new OTP.",409);
  return authSuccess({ok:true,linked:true,parent:{userId:parent.id,mobile}});
 }catch(e){if(e instanceof OwnershipError)return ownershipErrorResponse(e);return authFailure(e);}
}
