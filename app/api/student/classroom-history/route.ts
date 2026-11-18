import { NextResponse } from 'next/server';
import { requireStudentIdentity, OwnershipError, ownershipErrorResponse } from '@/lib/auth/ownership';
import { readClassroomBodyBounded } from '@/app/lib/classroomConversation.mjs';
import { validateClassroomCheckpoint, CLASSROOM_CHECKPOINT_LIMIT } from '@/app/lib/classroomCheckpoint.mjs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers:{'Cache-Control':'no-store, private'}});
export async function GET(req: Request) {
  try {
    const identity = await requireStudentIdentity(req);
    const id = new URL(req.url).searchParams.get('id');
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) return json({error:'Invalid recording.'},400);
    if (id) {
      const {data,error} = await identity.admin.from('student_classroom_checkpoints').select('payload,revision').eq('owner_id',identity.user.id).eq('id',id).maybeSingle();
      if(error) return json({error:'Class history is temporarily unavailable.'},503);
      return data ? json({ok:true,record:{...data.payload,studentMobile:identity.mobile,cloud:true},revision:data.revision}) : json({error:'Recording not found.'},404);
    }
    const {data,error} = await identity.admin.from('student_classroom_checkpoints')
      .select('id,updated_at,payload->subjectId,payload->chapterId,payload->topicId,payload->subject,payload->chapter,payload->topic,payload->language,payload->startedAt,payload->endedAt')
      .eq('owner_id',identity.user.id).order('updated_at',{ascending:false}).limit(CLASSROOM_CHECKPOINT_LIMIT);
    if(error) return json({error:'Class history is temporarily unavailable.'},503);
    return json({ok:true,records:(data||[]).map(row=>({...row,studentMobile:identity.mobile,cloud:true,cloudSummary:true,transcript:'Open this recording to read the full conversation.'}))});
  } catch(error) { return error instanceof OwnershipError ? ownershipErrorResponse(error) : json({error:'Class history is temporarily unavailable.'},503); }
}
export async function POST(req: Request) {
  try {
    const identity = await requireStudentIdentity(req);
    let checked;
    try {
      const body = await readClassroomBodyBounded(req, 110000);
      if (!body.ok) return json({error:"Recording is too large."},413);
      checked=validateClassroomCheckpoint(JSON.parse(body.text));
    }
    catch { return json({error:'The class could not be saved: invalid or oversized recording.'},422); }
    const {record,revision}=checked;
    const {data,error}=await identity.admin.rpc('save_student_classroom_checkpoint',{p_owner:identity.user.id,p_id:record.id,p_revision:revision,p_payload:record});
    if(error) return json({error:'Unable to save this class right now. Your browser copy is retained.'},503);
    return data ? json({ok:true,revision}) : json({error:'A newer class checkpoint is already saved.'},409);
  } catch(error) { return error instanceof OwnershipError ? ownershipErrorResponse(error) : json({error:'Class history is temporarily unavailable.'},503); }
}
