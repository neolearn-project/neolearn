import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin missing" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const mobile = String(searchParams.get("mobile") || "").trim();
  if (!mobile) return NextResponse.json({ ok: false, error: "mobile required" }, { status: 400 });

  try {
    // profile (weak topics + persona)
    const { data: profile, error: pErr } = await supabase
      .from("student_profile")
      .select("name, mobile, preferred_language, preferred_speed, explain_style, weak_topic_ids, updated_at")
      .eq("mobile", mobile)
      .maybeSingle();
    if (pErr) throw pErr;

    // last 5 memory items
    const { data: last, error: mErr } = await supabase
      .from("teacher_memory")
      .select("created_at, subject_id, chapter_id, topic_id, question")
      .eq("student_mobile", mobile)
      .order("created_at", { ascending: false })
      .limit(5);
    if (mErr) throw mErr;

    return NextResponse.json({
      ok: true,
      data: {
        profile: profile || null,
        recent_questions: last || [],
      },
    });
  } catch (e: any) {
    console.error("parent summary error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown" }, { status: 500 });
  }
}
