import { supabaseAdmin, supabasePublic } from "@/lib/supabaseAdmin";
import { StudentLoginError } from "./studentLoginCore.mjs";

export async function studentForMobile(mobile: string) {
  const admin = supabaseAdmin();
  const rows = await admin.from("students").select("id,user_id,username,phone").eq("phone",mobile).limit(2);
  if(rows.error) throw new StudentLoginError("Unable to check your account right now.",503);
  if((rows.data?.length||0)>1)return null;
  const row=rows.data?.[0];
  let id=row?.user_id||row?.id;
  if(!id) {
    const legacy=await admin.from("student_profile").select("student_id").eq("mobile",mobile).limit(2);
    if(legacy.error)throw new StudentLoginError("Unable to check your account right now.",503);
    if(legacy.data?.length!==1)return null;
    id=legacy.data[0].student_id;
  }
  const auth=await admin.auth.admin.getUserById(id);
  if(auth.error||!auth.data.user||auth.data.user.user_metadata?.role==="parent")return null;
  const username=row?.username||auth.data.user.user_metadata?.username||auth.data.user.user_metadata?.userId;
  if(!username)return null;
  return {id:auth.data.user.id,username};

}
export async function studentSessionResponse(user: any, session: any) {
  const admin = supabaseAdmin();
  const row = await admin.from("students").select("id,user_id,username,phone,name,full_name,class_label").eq("user_id",user.id).maybeSingle();
  if(row.error) throw new StudentLoginError("Unable to load your profile.",503);
  let studentRow = row.data;
  if(!studentRow) {
    const legacy = await admin.from("students").select("id,user_id,username,phone,name,full_name,class_label").eq("id",user.id).maybeSingle();
    if(legacy.error) throw new StudentLoginError("Unable to load your profile.",503);
    studentRow = legacy.data;
  }
  const profile = await admin.from("student_profile").select("mobile,name").eq("student_id",user.id).maybeSingle();
  if(profile.error) throw new StudentLoginError("Unable to load your profile.",503);
  const mobile = studentRow?.phone || profile.data?.mobile;
  if(!mobile) throw new StudentLoginError("Your student profile is not linked. Contact support.",403);
  const child = await admin.from("children").select("child_name,class_number,board,subject_type,parent_mobile").eq("child_mobile",mobile).order("id",{ascending:false}).limit(1).maybeSingle();
  if(child.error) throw new StudentLoginError("Unable to load your classroom profile.",503);
  const meta = user.user_metadata || {};
  const track = child.data?.subject_type || meta.track || "regular";
  const classId = String(child.data?.class_number || meta.classId || String(studentRow?.class_label||"").replace(/\D/g,"") || "6");
  return {ok:true,session:{access_token:session.access_token,refresh_token:session.refresh_token,expires_at:session.expires_at},student:{user_id:user.id,username:studentRow?.username||meta.username||meta.userId,name:child.data?.child_name||studentRow?.full_name||studentRow?.name||profile.data?.name||meta.name||"Student",mobile,class_id:classId,classId,board:child.data?.board||meta.board||"CBSE",track,competitiveExam:track==="competitive"?(meta.competitiveExam||meta.board):null,parent_mobile:child.data?.parent_mobile||null}};
}
export async function issueStudentSession(id: string) {
  const admin = supabaseAdmin();
  const found = await admin.auth.admin.getUserById(id);
  if(found.error || !found.data.user?.email) throw new StudentLoginError("Unable to open your session. Try password login.",503);
  const link = await admin.auth.admin.generateLink({type:"magiclink",email:found.data.user.email});
  if(link.error || link.data.user?.id !== id || !link.data.properties?.hashed_token) throw new StudentLoginError("Unable to open your session. Please try login again.",503);
  const verified = await supabasePublic().auth.verifyOtp({type:"magiclink",token_hash:link.data.properties.hashed_token});
  if(verified.error || !verified.data.session || verified.data.user?.id !== id) throw new StudentLoginError("Unable to open your session. Please try login again.",503);
  return studentSessionResponse(verified.data.user,verified.data.session);
}
