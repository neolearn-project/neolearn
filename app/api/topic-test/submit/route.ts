import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type TopicStatus = "not_started" | "in_progress" | "needs_revision" | "completed";

function statusFromScore(score: number): TopicStatus {
  if (score >= 80) return "completed";
  if (score < 40) return "needs_revision";
  return "in_progress";
}

function getSupabase() {
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing.");
  if (!supabaseServiceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing.");
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const studentMobile = String(body.studentMobile || body.mobile || "").trim();
    const studentName = String(body.studentName || "").trim() || null;

    const board = String(body.board || "cbse").trim().toLowerCase();
    const classNumber = Number(body.classNumber || body.classId);
    const subjectId = Number(body.subjectId);
    const chapterId = Number(body.chapterId);
    const topicId = Number(body.topicId);
    const score = Number(body.score);

    if (!studentMobile || !Number.isFinite(topicId) || !Number.isFinite(score)) {
      return NextResponse.json(
        { ok: false, error: "studentMobile, topicId, score are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const nowIso = new Date().toISOString();
    const nextStatus = statusFromScore(score);

    const { data: existing, error: readErr } = await supabase
      .from("topic_progress")
      .select("id, tests_taken")
      .eq("student_mobile", studentMobile)
      .eq("topic_id", topicId)
      .maybeSingle();

    if (readErr) {
      console.error("submit-test read topic_progress error:", readErr);
      return NextResponse.json(
        { ok: false, error: "DB error while reading topic_progress" },
        { status: 500 }
      );
    }

    if (existing?.id) {
      const nextTestsTaken = Number(existing.tests_taken || 0) + 1;

      const { error: updErr } = await supabase
        .from("topic_progress")
        .update({
          status: nextStatus,
          last_score: score,
          tests_taken: nextTestsTaken,
          last_test_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", existing.id);

      if (updErr) {
        console.error("submit-test update topic_progress error:", updErr);
        return NextResponse.json(
          { ok: false, error: "DB error while updating topic_progress" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        status: nextStatus,
        testsTaken: nextTestsTaken,
        score,
      });
    }

    // New topic-test submission without lesson-start progress row.
    // For insert, full context is required.
    if (
      !Number.isFinite(classNumber) ||
      !Number.isFinite(subjectId) ||
      !Number.isFinite(chapterId)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing classNumber, subjectId or chapterId for new topic progress row.",
        },
        { status: 400 }
      );
    }

    const { error: insErr } = await supabase.from("topic_progress").insert({
      student_mobile: studentMobile,
      student_name: studentName,
      board,
      class_number: classNumber,
      subject_id: subjectId,
      chapter_id: chapterId,
      topic_id: topicId,
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

    return NextResponse.json({
      ok: true,
      status: nextStatus,
      testsTaken: 1,
      score,
    });
  } catch (err: any) {
    console.error("submit-test route error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

