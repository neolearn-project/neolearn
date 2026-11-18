import { authBody, authFailure, authSuccess } from '@/app/lib/studentOtpServer';
import { teacherDb, teacherIdentity, teacherMutation } from '@/app/lib/teacherPortalServer';
import { StudentLoginError } from '@/app/lib/studentLoginCore.mjs';

export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function normalizeSlot(body: any) {
  const weekday = Number(body.iso_weekday);
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new StudentLoginError('Choose a weekday.');
  if (typeof body.local_start_time !== 'string' || !TIME.test(body.local_start_time)
    || typeof body.local_end_time !== 'string' || !TIME.test(body.local_end_time)
    || body.local_start_time >= body.local_end_time) {
    throw new StudentLoginError('Choose a valid start and end time.');
  }
  const timezone = body.timezone === undefined ? 'Asia/Kolkata' : body.timezone;
  if (typeof timezone !== 'string' || timezone.length > 100) throw new StudentLoginError('Choose a valid timezone.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date()); }
  catch { throw new StudentLoginError('Choose a valid timezone.'); }
  return { iso_weekday: weekday, local_start_time: body.local_start_time, local_end_time: body.local_end_time, timezone };
}

export async function POST(req: Request) {
  try {
    teacherMutation(req);
    const teacherId = await teacherIdentity();
    const body = await authBody(req);
    if (typeof body.offering_id !== 'string' || !UUID.test(body.offering_id)) throw new StudentLoginError('Class not found.', 404);

    const db = teacherDb();
    const offering = await db.from('teacher_portal_offerings')
      .select('id,status')
      .eq('id', body.offering_id)
      .eq('teacher_id', teacherId)
      .maybeSingle();
    if (offering.error) throw new StudentLoginError('Unable to load this class.', 503);
    if (!offering.data || offering.data.status === 'archived') throw new StudentLoginError('Class not found.', 404);

    const result = await db.from('teacher_portal_offering_schedules')
      .insert({ offering_id: body.offering_id, teacher_id: teacherId, ...normalizeSlot(body) })
      .select('id,offering_id,iso_weekday,local_start_time,local_end_time,timezone,is_active')
      .single();
    if (result.error) {
      const message = String(result.error.message || '');
      throw new StudentLoginError(message.includes('duplicate key') ? 'That weekly time slot already exists.' : 'Unable to save this weekly time slot.', 400);
    }
    return authSuccess({ ok: true, schedule: result.data }, 201);
  } catch (error) {
    return authFailure(error);
  }
}

export async function PATCH(req: Request) {
  try {
    teacherMutation(req);
    const teacherId = await teacherIdentity();
    const body = await authBody(req);
    if (typeof body.id !== 'string' || !UUID.test(body.id) || typeof body.is_active !== 'boolean') {
      throw new StudentLoginError('Invalid schedule update.');
    }
    const db = teacherDb();
    const current = await db.from('teacher_portal_offering_schedules')
      .select('id,offering_id,is_active')
      .eq('id', body.id)
      .eq('teacher_id', teacherId)
      .maybeSingle();
    if (current.error) throw new StudentLoginError('Unable to load the weekly time slot.', 503);
    if (!current.data) throw new StudentLoginError('Weekly time slot not found.', 404);

    if (!body.is_active && current.data.is_active) {
      const [offering, activeSlots] = await Promise.all([
        db.from('teacher_portal_offerings').select('billing_cycle,status').eq('id', current.data.offering_id).eq('teacher_id', teacherId).maybeSingle(),
        db.from('teacher_portal_offering_schedules').select('id', { count: 'exact', head: true }).eq('offering_id', current.data.offering_id).eq('teacher_id', teacherId).eq('is_active', true)
      ]);
      if (offering.error || activeSlots.error) throw new StudentLoginError('Unable to verify the remaining weekly time slots.', 503);
      if (offering.data?.status === 'published' && ['weekly','monthly'].includes(offering.data.billing_cycle) && (activeSlots.count || 0) <= 1) {
        throw new StudentLoginError('A published recurring class must keep at least one active weekly time slot.');
      }
    }

    const result = await db.from('teacher_portal_offering_schedules')
      .update({ is_active: body.is_active })
      .eq('id', body.id)
      .eq('teacher_id', teacherId)
      .select('id,offering_id,iso_weekday,local_start_time,local_end_time,timezone,is_active')
      .single();
    if (result.error) throw new StudentLoginError('Unable to update this weekly time slot.', 400);
    return authSuccess({ ok: true, schedule: result.data });
  } catch (error) {
    return authFailure(error);
  }
}

export async function DELETE(req: Request) {
  try {
    teacherMutation(req);
    const teacherId = await teacherIdentity();
    const body = await authBody(req);
    if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new StudentLoginError('Weekly time slot not found.', 404);

    const db = teacherDb();
    const current = await db.from('teacher_portal_offering_schedules')
      .select('id,offering_id,is_active')
      .eq('id', body.id)
      .eq('teacher_id', teacherId)
      .maybeSingle();
    if (current.error) throw new StudentLoginError('Unable to load the weekly time slot.', 503);
    if (!current.data) throw new StudentLoginError('Weekly time slot not found.', 404);

    if (current.data.is_active) {
      const [offering, activeSlots] = await Promise.all([
        db.from('teacher_portal_offerings').select('billing_cycle,status').eq('id', current.data.offering_id).eq('teacher_id', teacherId).maybeSingle(),
        db.from('teacher_portal_offering_schedules').select('id', { count: 'exact', head: true }).eq('offering_id', current.data.offering_id).eq('teacher_id', teacherId).eq('is_active', true)
      ]);
      if (offering.error || activeSlots.error) throw new StudentLoginError('Unable to verify the remaining weekly time slots.', 503);
      if (offering.data?.status === 'published' && ['weekly','monthly'].includes(offering.data.billing_cycle) && (activeSlots.count || 0) <= 1) {
        throw new StudentLoginError('A published recurring class must keep at least one active weekly time slot.');
      }
    }

    const result = await db.from('teacher_portal_offering_schedules').delete().eq('id', body.id).eq('teacher_id', teacherId);
    if (result.error) throw new StudentLoginError('Unable to remove this weekly time slot.', 400);
    return authSuccess({ ok: true });
  } catch (error) {
    return authFailure(error);
  }
}
