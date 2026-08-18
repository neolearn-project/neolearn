import { NextResponse } from "next/server";
import { getOrCreateDailyMission } from "@/lib/dailyMission";
import {
  OwnershipError,
  ownershipErrorResponse,
  requireStudentMobile,
} from "@/lib/auth/ownership";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function numberOrNull(value: string | null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mobile = String(searchParams.get("mobile") || "").trim();

  if (!mobile) {
    return NextResponse.json(
      { ok: false, error: "mobile is required" },
      { status: 400 }
    );
  }

  try {
    await requireStudentMobile(req, mobile);

    const result = await getOrCreateDailyMission(supabaseAdmin(), {
      studentMobile: mobile,
      board: searchParams.get("board"),
      classNumber: numberOrNull(searchParams.get("classNumber")),
      track: searchParams.get("track"),
      subjectId: numberOrNull(searchParams.get("subjectId")),
      chapterId: numberOrNull(searchParams.get("chapterId")),
      topicId: numberOrNull(searchParams.get("topicId")),
      subjectName: searchParams.get("subjectName"),
      chapterName: searchParams.get("chapterName"),
      topicName: searchParams.get("topicName"),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof OwnershipError) return ownershipErrorResponse(error);
    console.error("student daily mission GET error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load daily mission." },
      { status: 500 }
    );
  }
}
