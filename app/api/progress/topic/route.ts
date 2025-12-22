import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabase/server";

type TopicStatus =
  | "not_started"
  | "in_progress"
  | "needs_revision"
  | "completed";

function statusFromScore(score: number | null): TopicStatus {
  if (typeof score !== "number") return "in_progress";
  if (score >= 80) return "completed";
  if (score < 40) return "needs_revision";
  return "in_progress";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const studentMobile = String(body.studentMobile || "").trim();
    const studentName = body.studentName ?? null;
    const board = body.board ?? null;
    const classNumber = Number(body.classNumber);
    const subjectId = Number(body.subjectId);
    const chapterId = Number(body.chapterId);
    const topicId = Number(body.topicId);
    const score = body.score ?? null;

    if (
      !studentMobile ||
      !Number.isFinite(classNumber) ||
      !Number.isFinite(subjectId) ||
      !Number.isFinite(chapterId) ||
      !Number.isFinite(topicId)
    ) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const status = statusFromScore(score);
    const nowIso = new Date().toISOString();
    const supabase = supabaseServerAdmin();

    const { error } = await supabase
      .from("topic_progress")
      .upsert(
        {
          student_mobile: studentMobile,
          student_name: studentName,
          board,
          class_number: classNumber,
          subject_id: subjectId,
          chapter_id: chapterId,
          topic_id: topicId,
          status,
          updated_at: nowIso,
        },
        {
          onConflict: "student_mobile,subject_id,chapter_id,topic_id",
        }
      );

    if (error) {
      console.error("progress/topic upsert error:", error);
      return NextResponse.json(
        { ok: false, error: "DB error saving topic progress" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    console.error("progress/topic error:", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}
