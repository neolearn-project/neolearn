import {StudentLoginError} from "./studentLoginCore.mjs";
export function recoveryRole(value) {
 const role=String(value||"student").toLowerCase();
 if(!["student","parent"].includes(role))throw new StudentLoginError("Choose student or parent.");
 return role;
}
export function parentLinkBinding(studentId,parentName) {
 const name=String(parentName||"Parent").trim();
 if(!name||name.length>120)throw new StudentLoginError("Enter a valid parent name.");
 return JSON.stringify({studentId,parentName:name,permission:"student_progress"});
}
export async function completeAccountRecovery({flow,mobile,role,otpToken,otp,newPassword,resolve,updatePassword}) {
 if(typeof newPassword!=="string"||newPassword.length<6||newPassword.length>128)throw new StudentLoginError("Password must be 6–128 characters.");
 const purpose=role+"_reset";
 const id=await flow.verify({mobile,purpose,binding:purpose,otpToken,otp});
 const current=await resolve(role,mobile);
 if(!id||current?.id!==id)throw new StudentLoginError("Account changed or is unavailable. Start recovery again.",401);
 await updatePassword(id,newPassword);
 return {ok:true,message:"Password updated. Please log in."};
}
