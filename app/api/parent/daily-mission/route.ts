import { NextResponse } from "next/server";
import { getOrCreateDailyMission } from "@/lib/dailyMission";
import {
  OwnershipError,
  ownershipErrorResponse,
  requireParentChild,
} from "@/lib/auth/ownership";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const studentId = String(
    searchParams.get("studentId") || searchParams.get("mobile") || ""
  ).trim();

  if (!studentId) {
    return NextResponse.json(
      { ok: false, error: "studentId is required" },
      { status: 400 }
    );
  }

  try {
    await requireParentChild(req, studentId);

    const result = await getOrCreateDailyMission(supabaseAdmin(), {
      studentMobile: studentId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof OwnershipError) return ownershipErrorResponse(error);
    console.error("parent daily mission GET error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load child daily mission." },
      { status: 500 }
    );
  }
}
