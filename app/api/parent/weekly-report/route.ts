// app/api/parent/weekly-report/route.ts
import { NextResponse } from "next/server";
import { OwnershipError, ownershipErrorResponse, requireParentChild } from "@/lib/auth/ownership";
import { readJsonResponse } from "@/app/lib/safeResponse";

export const dynamic = "force-dynamic";

function makeWeeklySummary(opts: {
  childName?: string | null;
  weekStart: string;
  weekEnd: string;
  topicsCompleted: number;
  testsTaken: number;
  avgScore: number | null;
  needsRevisionCount: number;
}) {
  const name = opts.childName ? opts.childName : "Your child";
  const scorePart =
    opts.avgScore === null ? "no test score recorded" : `avg score ${opts.avgScore}%`;

  const revisionPart =
    opts.needsRevisionCount > 0
      ? `Needs revision in ${opts.needsRevisionCount} topic(s).`
      : `No weak topics flagged.`;

  return `Week (${opts.weekStart} to ${opts.weekEnd}): ${name} completed ${opts.topicsCompleted} topic(s), attempted ${opts.testsTaken} test(s), ${scorePart}. ${revisionPart}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const childMobile = searchParams.get("childMobile");

    if (!childMobile) {
      return NextResponse.json(
        { ok: false, error: "childMobile is required" },
        { status: 400 }
      );
    }
    const identity = await requireParentChild(req, childMobile);

    const base = new URL(req.url).origin;
    const internalHeaders = {
      Authorization: `Bearer ${identity.token}`,
      cookie: req.headers.get("cookie") || "",
    };

    const { data: childProfile, error: childProfileError } =
      await identity.admin
        .from("children")
        .select("child_name, child_mobile, board, class_number")
        .eq("parent_mobile", identity.mobile)
        .eq("child_mobile", childMobile)
        .limit(1)
        .maybeSingle();

    if (childProfileError) {
      console.error("weekly-report child profile error:", childProfileError);
    }

    // 1) Weekly progress
    const weeklyRes = await fetch(
      `${base}/api/progress/weekly-get?mobile=${encodeURIComponent(childMobile)}`,
      {
        cache: "no-store",
        headers: internalHeaders,
      }
    );
    const { data: weeklyData, errorText: weeklyError } =
      await readJsonResponse<any>(weeklyRes);

    if (!weeklyRes.ok || !weeklyData?.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            weeklyData?.error ||
            weeklyError ||
            "Failed to load weekly progress",
        },
        {
          status:
            weeklyRes.status >= 400 && weeklyRes.status < 500
              ? weeklyRes.status
              : 502,
        }
      );
    }

    const weeks = Array.isArray(weeklyData.weeks) ? weeklyData.weeks : [];
    const latestWeek = weeklyData.latestWeek ?? (weeks.length > 0 ? weeks[0] : null);

    if (!latestWeek) {
      return NextResponse.json({
        ok: true,
        child: childProfile || null,
        weeks,
        latestWeek: null,
        summaryText: "No weekly progress found yet.",
        weakTopics: [],
      });
    }

    const { weekStart, weekEnd, topicsCompleted, testsTaken, avgScore } = latestWeek;

    // 2) Weak topics list
    const weakRes = await fetch(
      `${base}/api/progress/weak-topics?mobile=${encodeURIComponent(childMobile)}&limit=8`,
      {
        cache: "no-store",
        headers: internalHeaders,
      }
    );
    const { data: weakData, errorText: weakError } =
      await readJsonResponse<any>(weakRes);
    if (!weakRes.ok) {
      console.error(
        "weekly-report weak topics error:",
        weakData?.error || weakError
      );
    }
    const weakTopics = weakRes.ok && weakData?.ok ? weakData.weakTopics ?? [] : [];

    // count needs_revision from returned weakTopics (simple + no direct DB call needed)
    const needsRevisionCount = Array.isArray(weakTopics) ? weakTopics.length : 0;

    const summaryText = makeWeeklySummary({
      childName: childProfile?.child_name || null,
      weekStart,
      weekEnd,
      topicsCompleted,
      testsTaken,
      avgScore,
      needsRevisionCount,
    });

    return NextResponse.json({
      ok: true,
      child: childProfile || null,
      weeks,
      latestWeek,
      weakTopics,
      summaryText,
    });
  } catch (e: any) {
    if (e instanceof OwnershipError) return ownershipErrorResponse(e);
    console.error("weekly-report route error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

