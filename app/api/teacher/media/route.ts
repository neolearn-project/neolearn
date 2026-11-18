import {randomUUID} from 'node:crypto';
import {authBody,authFailure,authSuccess} from '@/app/lib/studentOtpServer';
import {teacherIdentity,teacherMutation,teacherDb,teacherRpc} from '@/app/lib/teacherPortalServer';
import {validateTeacherMedia} from '@/app/lib/teacherPortalCore.mjs';
import {StudentLoginError} from '@/app/lib/studentLoginCore.mjs';
export const runtime='nodejs';
export async function POST(req:Request){try{
 teacherMutation(req);const id=await teacherIdentity(),b=await authBody(req),db=teacherDb();
 if(b.action==='complete'){
 const row=await db.from('teacher_portal_media').select('*').eq('id',b.id).eq('teacher_id',id).single();if(row.error)throw new StudentLoginError('Upload not found.',404);
 const m=row.data;const files=await db.storage.from('teacher-portal').list(id,{search:m.id,limit:2});const file=files.data?.find(f=>f.name===m.id);
 if(files.error||!file||Number(file.metadata?.size)!==m.bytes||file.metadata?.mimetype!==m.mime)throw new StudentLoginError('Upload is incomplete or does not match the selected file.');
 await teacherRpc('teacher_portal_complete_media',{p_id:id,p_media:m.id});return authSuccess({ok:true});
 }
 const media=validateTeacherMedia(b.kind,b.type,b.size);const mediaId=randomUUID(),path=id+'/'+mediaId;
 await teacherRpc('teacher_portal_reserve_media',{p_id:id,p_media:mediaId,p_kind:media.kind,p_mime:media.type,p_bytes:media.size,p_path:path});
 const upload=await db.storage.from('teacher-portal').createSignedUploadUrl(path);if(upload.error)throw Error('upload');return authSuccess({ok:true,id:mediaId,path,token:upload.data.token});
 }catch(e){return authFailure(e);}}
