import {authBody,authFailure,authSuccess} from '@/app/lib/studentOtpServer';
import {teacherIdentity,teacherMutation,teacherProfileWithMedia,teacherRpc} from '@/app/lib/teacherPortalServer';
import {normalizeTeacherProfile} from '@/app/lib/teacherPortalCore.mjs';
export const runtime='nodejs';
export async function GET(){try{return authSuccess({ok:true,profile:await teacherProfileWithMedia(await teacherIdentity())});}catch(e){return authFailure(e);}}
export async function POST(req:Request){try{teacherMutation(req);const id=await teacherIdentity();const b=await authBody(req);const profile=normalizeTeacherProfile(b.profile);await teacherRpc('teacher_portal_save',{p_id:id,p_version:b.version,p_profile:profile,p_submit:b.submit===true});return authSuccess({ok:true,profile:await teacherProfileWithMedia(id)});}catch(e){return authFailure(e);}}
