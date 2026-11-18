import {authBody,authFailure,authSuccess} from '@/app/lib/studentOtpServer';
import {teacherMutation,teacherOtp,teacherDb,hash} from '@/app/lib/teacherPortalServer';
import {cookies} from 'next/headers';
export const runtime='nodejs';
export async function POST(req:Request){try{teacherMutation(req);return authSuccess(await teacherOtp(req,await authBody(req)));}catch(e){return authFailure(e);}}
export async function DELETE(req:Request){try{teacherMutation(req);const t=cookies().get('neolearn_teacher')?.value;if(t){const r=await teacherDb().from('teacher_portal_sessions').delete().eq('token_hash',hash(t));if(r.error)throw Error('logout');}cookies().delete('neolearn_teacher');return authSuccess({ok:true});}catch(e){return authFailure(e);}}
