import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("parent summary env missing", {
      hasUrl: Boolean(url),
      hasServiceKey: Boolean(key),
    });
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase admin missing" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const mobile = String(searchParams.get("mobile") || "").trim();

  if (!mobile) {
    return NextResponse.json(
      { ok: false, error: "mobile required" },
      { status: 400 }
    );
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from("student_profile")
      .select("name, mobile, preferred_language, preferred_speed, explain_style, weak_topic_ids, updated_at")
      .eq("mobile", mobile)
      .maybeSingle();

    if (profileError) {
      console.error("parent summary profile error:", profileError);
      throw profileError;
    }

    const { data: recentQuestions, error: memoryError } = await supabase
      .from("teacher_memory")
      .select("created_at, subject_id, chapter_id, topic_id, question")
      .eq("student_mobile", mobile)
      .order("created_at", { ascending: false })
      .limit(5);

    if (memoryError) {
      console.error("parent summary memory error:", memoryError);
      throw memoryError;
    }

    const { data: recentProgress, error: progressError } = await supabase
      .from("topic_progress")
      .select("updated_at, board, class_number, subject_id, chapter_id, topic_id, status")
      .eq("student_mobile", mobile)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (progressError) {
      console.error("parent summary progress error:", progressError);
      throw progressError;
    }

    return NextResponse.json({
      ok: true,
      data: {
        profile: profile || null,
        recent_questions: recentQuestions || [],
        recent_progress: recentProgress || [],
      },
    });
  } catch (err: any) {
    console.error("parent summary error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown parent summary error" },
      { status: 500 }
    );
  }
}

