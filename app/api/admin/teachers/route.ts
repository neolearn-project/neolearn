import {NextRequest} from 'next/server';
import {requireAdmin} from '@/app/lib/adminAuth';
import {authBody,authFailure,authSuccess} from '@/app/lib/studentOtpServer';
import {teacherDb,teacherProfileWithMedia,teacherRpc} from '@/app/lib/teacherPortalServer';
export const runtime='nodejs';
export async function GET(req:NextRequest){const denied=requireAdmin(req);if(denied)return denied;try{const id=req.nextUrl.searchParams.get('id');if(id)return authSuccess({ok:true,profile:await teacherProfileWithMedia(id)});const r=await teacherDb().from('teacher_portal_profiles').select('id,profile,status,version,updated_at').order('updated_at',{ascending:false}).limit(100);if(r.error)throw Error('list');return authSuccess({ok:true,teachers:r.data});}catch(e){return authFailure(e);}}
export async function POST(req:NextRequest){const denied=requireAdmin(req);if(denied)return denied;try{const b=await authBody(req);await teacherRpc('teacher_portal_review',{p_id:b.id,p_version:b.version,p_action:b.action,p_reason:typeof b.reason==='string'?b.reason:''});return authSuccess({ok:true});}catch(e){return authFailure(e);}}
