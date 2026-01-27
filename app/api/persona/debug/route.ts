import { NextResponse } from "next/server";
import { supabaseAdminClient } from "@/app/lib/supabaseServer";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const studentId = String(searchParams.get("studentId") || "").trim();
  const mobile = String(searchParams.get("mobile") || "").trim();

  if (!studentId && !mobile) {
    return NextResponse.json({ ok: false, error: "Send studentId or mobile" }, { status: 400 });
  }

  const supabase = supabaseAdminClient();

  const q = supabase
    .from("student_profile")
    .select("student_id, mobile, name, preferred_language, preferred_speed, explain_style, weak_topic_ids, persona_summary, created_at, updated_at");

  const { data, error } = studentId
    ? await q.eq("student_id", studentId).maybeSingle()
    : await q.eq("mobile", mobile).maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, profile: data || null });
}
