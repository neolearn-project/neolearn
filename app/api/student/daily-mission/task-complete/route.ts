import { NextResponse } from "next/server";
import {
  MissionTaskType,
  completeDailyMissionTask,
} from "@/lib/dailyMission";
import {
  OwnershipError,
  ownershipErrorResponse,
  requireStudentMobile,
} from "@/lib/auth/ownership";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TASK_TYPES = new Set(["learn_topic", "topic_test", "review_weak_area"]);

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const studentMobile = String(body.studentMobile || body.mobile || "").trim();
    const taskType = String(body.taskType || "") as MissionTaskType;

    if (!studentMobile || !TASK_TYPES.has(taskType)) {
      return NextResponse.json(
        { ok: false, error: "studentMobile and valid taskType are required" },
        { status: 400 }
      );
    }

    await requireStudentMobile(req, studentMobile);

    const result = await completeDailyMissionTask(
      supabaseAdmin(),
      studentMobile,
      {
        taskType,
        score: numberOrNull(body.score),
        weakArea: body.weakArea ? String(body.weakArea) : null,
        subjectId: numberOrNull(body.subjectId),
        chapterId: numberOrNull(body.chapterId),
        topicId: numberOrNull(body.topicId),
        subjectName: body.subjectName ? String(body.subjectName) : null,
        chapterName: body.chapterName ? String(body.chapterName) : null,
        topicName: body.topicName ? String(body.topicName) : null,
        eventType: body.eventType ? String(body.eventType) : null,
      }
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof OwnershipError) return ownershipErrorResponse(error);
    console.error("student daily mission task-complete error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update daily mission." },
      { status: 500 }
    );
  }
}
