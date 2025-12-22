// app/api/topic-test/submit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type TopicStatus = "not_started" | "in_progress" | "needs_revision" | "completed";

function statusFromScore(score: number): TopicStatus {
  if (score >= 80) return "completed";
  if (score < 40) return "needs_revision";
  return "in_progress";
}

export async function POST(req: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase server env vars are missing." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const studentMobile = String(body.studentMobile || "").trim();
    const topicIdNum = Number(body.topicId);
    const score = Number(body.score);

    if (!studentMobile || !Number.isFinite(topicIdNum) || !Number.isFinite(score)) {
      return NextResponse.json(
        { ok: false, error: "studentMobile, topicId, score are required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const nowIso = new Date().toISOString();
    const nextStatus = statusFromScore(score);

    // ✅ 1) READ FIRST (existing is defined here)
    const { data: existing, error: readErr } = await supabase
      .from("topic_progress")
      .select("id, tests_taken")
      .eq("student_mobile", studentMobile)
      .eq("topic_id", topicIdNum)
      .maybeSingle();

    if (readErr) {
      console.error("submit-test read topic_progress error:", readErr);
      return NextResponse.json(
        { ok: false, error: "DB error while reading topic_progress" },
        { status: 500 }
      );
    }

    // ✅ 2) THEN compute testsTaken
    const nextTestsTaken = (existing?.tests_taken || 0) + 1;

    // ✅ 3) UPDATE
    const { data: updated, error: updErr } = await supabase
      .from("topic_progress")
      .update({
        status: nextStatus,
        last_score: score,
        tests_taken: nextTestsTaken,
        last_test_at: nowIso,
        updated_at: nowIso,
      })
      .eq("student_mobile", studentMobile)
      .eq("topic_id", topicIdNum)
      .select("id");

    if (updErr) {
      console.error("submit-test update topic_progress error:", updErr);
      return NextResponse.json(
        { ok: false, error: "DB error while updating topic_progress" },
        { status: 500 }
      );
    }

    // ✅ 4) INSERT if no row existed
    if (!updated || updated.length === 0) {
      const { error: insErr } = await supabase.from("topic_progress").insert({
        student_mobile: studentMobile,
        topic_id: topicIdNum,
        status: nextStatus,
        last_score: score,
        tests_taken: 1,
        last_test_at: nowIso,
        updated_at: nowIso,
      });

      if (insErr) {
        console.error("submit-test insert topic_progress error:", insErr);
        return NextResponse.json(
          { ok: false, error: "DB error while inserting topic_progress" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, status: nextStatus, testsTaken: 1, score });
    }

    return NextResponse.json({ ok: true, status: nextStatus, testsTaken: nextTestsTaken, score });
  } catch (err: any) {
    console.error("submit-test route error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
