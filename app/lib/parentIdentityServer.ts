import {supabaseAdmin,supabasePublic} from "@/lib/supabaseAdmin";
import {StudentLoginError} from "./studentLoginCore.mjs";
export async function parentForMobile(mobile:string) {
 const admin=supabaseAdmin();
 const profiles=await admin.from("parent_profile").select("user_id,mobile,full_name").eq("mobile",mobile).limit(2);
 if(profiles.error)throw new StudentLoginError("Unable to check the parent account right now.",503);
 if(!profiles.data?.length)return null;
 if(profiles.data.length!==1)throw new StudentLoginError("Parent records need support review.",409);
 const profile=profiles.data[0];
 const user=await admin.auth.admin.getUserById(profile.user_id);
 if(user.error||!user.data.user)throw new StudentLoginError("Parent account is unavailable. Contact support.",409);
 return {id:user.data.user.id,name:profile.full_name||"Parent",mobile};
}
// Called only after a purpose-bound OTP has been consumed successfully.
export async function ensureVerifiedParent(mobile:string,name:string,expectedId:string|null) {
 const existing=await parentForMobile(mobile);
 if(existing) {
  if(expectedId&&existing.id!==expectedId)throw new StudentLoginError("Parent identity changed. Please request a new OTP.",409);
  return existing;
 }
 if(expectedId)throw new StudentLoginError("Parent identity changed. Please request a new OTP.",409);
 const admin=supabaseAdmin();
 const created=await admin.auth.admin.createUser({email:"parent_"+mobile+"@neolearn.in",password:crypto.randomUUID(),email_confirm:true,user_metadata:{role:"parent",name,mobile}});
 if(created.error||!created.data.user)throw new StudentLoginError("Unable to create the parent profile. If the account already exists, contact support.",409);
 const saved=await admin.from("parent_profile").insert({user_id:created.data.user.id,mobile,full_name:name,country:"India",preferred_language:"English"});
 if(saved.error)throw new StudentLoginError("Parent profile needs support review. No child access was granted.",503);
 return {id:created.data.user.id,name,mobile};
}
export async function parentSessionResponse(parent:{id:string,name:string,mobile:string}) {
 const admin=supabaseAdmin();
 const found=await admin.auth.admin.getUserById(parent.id);
 if(found.error||!found.data.user?.email)throw new StudentLoginError("Unable to open the parent session.",503);
 const link=await admin.auth.admin.generateLink({type:"magiclink",email:found.data.user.email});
 if(link.error||link.data.user?.id!==parent.id||!link.data.properties?.hashed_token)throw new StudentLoginError("Unable to open the parent session.",503);
 const verified=await supabasePublic().auth.verifyOtp({type:"magiclink",token_hash:link.data.properties.hashed_token});
 if(verified.error||!verified.data.session||verified.data.user?.id!==parent.id)throw new StudentLoginError("Unable to open the parent session.",503);
 const session=verified.data.session;
 return {ok:true,parent:{userId:parent.id,name:parent.name,mobile:parent.mobile},session:{access_token:session.access_token,refresh_token:session.refresh_token,expires_at:session.expires_at}};
}
