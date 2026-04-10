import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabase() {
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing.");
  if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY missing.");
  return createClient(supabaseUrl, supabaseKey);
}

function parseLimit(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") || "").trim();
    const limit = Math.min(Number(searchParams.get("limit") || 20), 50);

    const supabase = getSupabase();

    let query = supabase
      .from("children")
      .select("id, child_name, child_mobile, board, class_number")
      .order("id", { ascending: false })
      .limit(limit);

    if (q) {
      query = query.or(
        `child_name.ilike.%${q}%,child_mobile.ilike.%${q}%`
      );
    }

    const { data: students, error: studentsError } = await query;

    if (studentsError) {
      return NextResponse.json({ ok: false, error: studentsError.message }, { status: 500 });
    }

    const { data: globalSettingRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "student_free_limit")
      .maybeSingle();

    const globalLimit = parseLimit(globalSettingRow?.value, 5);

    const rows = await Promise.all(
      (students || []).map(async (student: any) => {
        const mobile = student.child_mobile;

        const [{ data: progressRows }, { data: overrideRow }, { data: policyRow }] =
          await Promise.all([
            supabase
              .from("topic_progress")
              .select("topic_id")
              .eq("student_mobile", mobile),
            supabase
              .from("access_override")
              .select("is_active, expires_at, reason")
              .eq("student_mobile", mobile)
              .maybeSingle(),
            supabase
              .from("student_access_policy")
              .select("custom_limit")
              .eq("student_mobile", mobile)
              .maybeSingle(),
          ]);

        const used = new Set(
          (progressRows || []).map((r: any) => r.topic_id).filter(Boolean)
        ).size;

        const studentCustomLimit =
          policyRow && policyRow.custom_limit !== null
            ? parseLimit(policyRow.custom_limit, globalLimit)
            : null;

        const effectiveLimit = studentCustomLimit ?? globalLimit;

        const overrideActive =
          !!overrideRow?.is_active &&
          (!overrideRow?.expires_at ||
            new Date(overrideRow.expires_at).getTime() > Date.now());

        return {
          id: student.id,
          name: student.child_name,
          mobile,
          userId: null,
          classId: student.class_number,
          board: student.board,
          used,
          globalLimit,
          studentCustomLimit,
          effectiveLimit,
          overrideActive,
          overrideReason: overrideRow?.reason || null,
          overrideExpiresAt: overrideRow?.expires_at || null,
        };
      })
    );

    return NextResponse.json({ ok: true, students: rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Student search failed." },
      { status: 500 }
    );
  }
}