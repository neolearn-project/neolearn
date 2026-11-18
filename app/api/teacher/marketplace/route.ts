import { authFailure, authSuccess } from '@/app/lib/studentOtpServer';
import { teacherDb } from '@/app/lib/teacherPortalServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const board = params.get('board')?.trim().toLowerCase();
    const subject = params.get('subject')?.trim().toLowerCase();
    const classNumber = params.get('class');
    const cycle = params.get('cycle');
    const db = teacherDb();

    let query = db.from('teacher_portal_offerings')
      .select('id,teacher_id,title,description,subject_name,board,class_number,billing_cycle,sessions_per_week,session_duration_minutes,delivery_mode,price_inr,max_students')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(100);
    if (board && ['cbse','tbse','icse','other'].includes(board)) query = query.eq('board', board);
    if (classNumber && /^([1-9]|1[0-2])$/.test(classNumber)) query = query.eq('class_number', Number(classNumber));
    if (cycle && ['one_off','weekly','monthly'].includes(cycle)) query = query.eq('billing_cycle', cycle);

    const result = await query;
    if (result.error) throw new Error('marketplace');
    const offerings = result.data || [];
    if (!offerings.length) return authSuccess({ ok: true, teachers: [] });

    const teacherIds = [...new Set(offerings.map((item: any) => item.teacher_id))];
    const [profilesResult, mediaResult] = await Promise.all([
      db.from('teacher_portal_profiles').select('id,profile').in('id', teacherIds).eq('status', 'approved'),
      db.from('teacher_portal_media').select('id,teacher_id,path,created_at').in('teacher_id', teacherIds).eq('kind', 'demo').eq('complete', true).order('created_at', { ascending: false })
    ]);
    if (profilesResult.error || mediaResult.error) throw new Error('marketplace');

    const profiles = new Map((profilesResult.data || []).map((row: any) => [row.id, row.profile || {}]));
    const latestDemo = new Map<string, string>();
    for (const item of mediaResult.data || []) if (!latestDemo.has(item.teacher_id)) latestDemo.set(item.teacher_id, item.path);

    const demoUrls = new Map<string, string>();
    await Promise.all([...latestDemo.entries()].map(async ([teacherId, path]) => {
      const signed = await db.storage.from('teacher-portal').createSignedUrl(path, 600);
      if (!signed.error) demoUrls.set(teacherId, signed.data.signedUrl);
    }));

    const teachers = offerings
      .filter((item: any) => profiles.has(item.teacher_id))
      .filter((item: any) => !subject || String(item.subject_name).toLowerCase().includes(subject))
      .map((item: any) => {
        const p: any = profiles.get(item.teacher_id);
        return {
          ...item,
          teacher: {
            name: p.name || '',
            bio: p.bio || '',
            qualification: p.qualification || '',
            state: p.state || '',
            experience: p.experience || 0,
            subjects: p.subjects || [],
            classes: p.classes || [],
            boards: p.boards || [],
            languages: p.languages || []
          },
          demo_url: demoUrls.get(item.teacher_id) || null
        };
      });
    return authSuccess({ ok: true, teachers });
  } catch (error) {
    return authFailure(error);
  }
}
