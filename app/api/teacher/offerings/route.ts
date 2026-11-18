import { authBody, authFailure, authSuccess } from '@/app/lib/studentOtpServer';
import { teacherDb, teacherIdentity, teacherMutation } from '@/app/lib/teacherPortalServer';
import { StudentLoginError } from '@/app/lib/studentLoginCore.mjs';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOARDS = ['cbse', 'tbse', 'icse', 'other'];
const CYCLES = ['one_off', 'weekly', 'monthly'];
const MODES = ['online', 'in_person', 'hybrid'];

function parseOffering(input: any, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StudentLoginError('Invalid class details.');
  const out: Record<string, unknown> = {};
  const text = (key: string, min: number, max: number) => {
    const value = input[key];
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
      throw new StudentLoginError(`Check ${key.replaceAll('_', ' ')}.`);
    }
    out[key] = value.trim();
  };
  const number = (key: string, min: number, max: number, integer = true) => {
    const value = Number(input[key]);
    if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) {
      throw new StudentLoginError(`Check ${key.replaceAll('_', ' ')}.`);
    }
    out[key] = value;
  };
  const oneOf = (key: string, values: string[]) => {
    if (typeof input[key] !== 'string' || !values.includes(input[key])) throw new StudentLoginError(`Choose a valid ${key.replaceAll('_', ' ')}.`);
    out[key] = input[key];
  };

  if (!partial || input.title !== undefined) text('title', 3, 120);
  if (!partial || input.description !== undefined) {
    const value = input.description === undefined ? '' : input.description;
    if (typeof value !== 'string' || value.length > 3000) throw new StudentLoginError('Description must be 3,000 characters or fewer.');
    out.description = value.trim();
  }
  if (!partial || input.subject_name !== undefined) text('subject_name', 1, 100);
  if (!partial || input.board !== undefined) oneOf('board', BOARDS);
  if (!partial || input.billing_cycle !== undefined) oneOf('billing_cycle', CYCLES);
  if (!partial || input.delivery_mode !== undefined) oneOf('delivery_mode', MODES);
  if (!partial || input.price_inr !== undefined) number('price_inr', 0, 1000000, false);
  if (!partial || input.sessions_per_week !== undefined) number('sessions_per_week', 1, 14);
  if (!partial || input.session_duration_minutes !== undefined) number('session_duration_minutes', 15, 240);
  if (!partial || input.max_students !== undefined) number('max_students', 1, 100);

  if (!partial || input.class_number !== undefined) {
    if (input.class_number === null || input.class_number === '') out.class_number = null;
    else number('class_number', 1, 12);
  }
  return out;
}

export async function GET() {
  try {
    const teacherId = await teacherIdentity();
    const db = teacherDb();
    const offerings = await db.from('teacher_portal_offerings')
      .select('id,title,description,subject_name,board,class_number,billing_cycle,sessions_per_week,session_duration_minutes,delivery_mode,price_inr,max_students,status,created_at,updated_at')
      .eq('teacher_id', teacherId)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (offerings.error) throw new StudentLoginError('Unable to load your class offerings.', 503);

    const ids = (offerings.data || []).map((row: any) => row.id);
    let schedules: any[] = [];
    if (ids.length) {
      const result = await db.from('teacher_portal_offering_schedules')
        .select('id,offering_id,iso_weekday,local_start_time,local_end_time,timezone,is_active')
        .eq('teacher_id', teacherId)
        .in('offering_id', ids)
        .order('iso_weekday')
        .order('local_start_time');
      if (result.error) throw new StudentLoginError('Unable to load your weekly schedule.', 503);
      schedules = result.data || [];
    }
    return authSuccess({ ok: true, offerings: offerings.data || [], schedules });
  } catch (error) {
    return authFailure(error);
  }
}

export async function POST(req: Request) {
  try {
    teacherMutation(req);
    const teacherId = await teacherIdentity();
    const body = await authBody(req);
    const row = await teacherDb().from('teacher_portal_offerings')
      .insert({ ...parseOffering(body), teacher_id: teacherId, status: 'draft' })
      .select('*')
      .single();
    if (row.error) throw new StudentLoginError('Unable to save this class. Check the details and try again.', 400);
    return authSuccess({ ok: true, offering: row.data }, 201);
  } catch (error) {
    return authFailure(error);
  }
}

export async function PATCH(req: Request) {
  try {
    teacherMutation(req);
    const teacherId = await teacherIdentity();
    const body = await authBody(req);
    if (typeof body.id !== 'string' || !UUID.test(body.id)) throw new StudentLoginError('Class not found.', 404);

    const db = teacherDb();
    let patch: Record<string, unknown>;
    if (body.action === 'publish') patch = { status: 'published' };
    else if (body.action === 'pause') patch = { status: 'paused' };
    else if (body.action === 'archive') patch = { status: 'archived' };
    else if (body.action === 'draft') patch = { status: 'draft' };
    else patch = parseOffering(body, true);

    if (!Object.keys(patch).length) throw new StudentLoginError('No class changes were provided.');
    const row = await db.from('teacher_portal_offerings')
      .update(patch)
      .eq('id', body.id)
      .eq('teacher_id', teacherId)
      .select('*')
      .maybeSingle();
    if (row.error) {
      const message = String(row.error.message || '');
      if (message.includes('TEACHER_NOT_APPROVED')) throw new StudentLoginError('Your profile must be approved before you can publish classes.', 403);
      if (message.includes('ACTIVE_WEEKLY_SCHEDULE_REQUIRED')) throw new StudentLoginError('Add at least one active weekly time slot before publishing this plan.');
      throw new StudentLoginError('Unable to update this class. Please refresh and try again.', 400);
    }
    if (!row.data) throw new StudentLoginError('Class not found.', 404);
    return authSuccess({ ok: true, offering: row.data });
  } catch (error) {
    return authFailure(error);
  }
}
