import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mobile = String(searchParams.get("mobile") || "").trim();
  const topicId = String(searchParams.get("topicId") || "").trim();

  if (!mobile) {
    return NextResponse.json(
      { ok: false, error: "mobile required" },
      { status: 400 }
    );
  }

  const supabase = supabaseServerAdmin();

  try {
    let q = supabase
      .from("teacher_memory")
      .select("question, created_at")
      .eq("student_mobile", mobile)
      .order("created_at", { ascending: false })
      .limit(100);

    if (topicId) q = q.eq("topic_id", topicId);

    const { data, error } = await q;
    if (error) throw error;

    const confusionRegex =
      /(don'?t understand|explain again|confused|not clear|samajh|pari na|bujhte)/i;

    let confusion = 0;
    for (const row of data || []) {
      if (confusionRegex.test(String(row.question))) confusion++;
    }

    let status = "in_progress";
    if (confusion >= 3) status = "needs_revision";
    if ((data?.length || 0) >= 5 && confusion === 0) status = "likely_clear";

    return NextResponse.json({
      ok: true,
      topicId: topicId || null,
      total_interactions: data?.length || 0,
      confusion_count: confusion,
      inferred_status: status,
    });
  } catch (e: any) {
    console.error("topic-status error:", e);
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}
