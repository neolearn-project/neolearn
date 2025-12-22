// app/api/parent/weekly-report/route.ts
import { NextResponse } from "next/server";

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

    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3004";

    // 1) Weekly progress
    const weeklyRes = await fetch(
      `${base}/api/progress/weekly-get?mobile=${encodeURIComponent(childMobile)}`,
      { cache: "no-store" }
    );
    const weeklyData = await weeklyRes.json();

    if (!weeklyRes.ok || !weeklyData?.ok) {
      return NextResponse.json(
        { ok: false, error: weeklyData?.error || "Failed to load weekly progress" },
        { status: 500 }
      );
    }

    const weeks = Array.isArray(weeklyData.weeks) ? weeklyData.weeks : [];
    const latestWeek = weeklyData.latestWeek ?? (weeks.length > 0 ? weeks[0] : null);

    if (!latestWeek) {
      return NextResponse.json({
        ok: true,
        latestWeek: null,
        summaryText: "No weekly progress found yet.",
        weakTopics: [],
      });
    }

    const { weekStart, weekEnd, topicsCompleted, testsTaken, avgScore } = latestWeek;

    // 2) Weak topics list
    const weakRes = await fetch(
      `${base}/api/progress/weak-topics?mobile=${encodeURIComponent(childMobile)}&limit=8`,
      { cache: "no-store" }
    );
    const weakData = await weakRes.json();
    const weakTopics = weakRes.ok && weakData?.ok ? weakData.weakTopics ?? [] : [];

    // count needs_revision from returned weakTopics (simple + no direct DB call needed)
    const needsRevisionCount = Array.isArray(weakTopics) ? weakTopics.length : 0;

    const summaryText = makeWeeklySummary({
      childName: null,
      weekStart,
      weekEnd,
      topicsCompleted,
      testsTaken,
      avgScore,
      needsRevisionCount,
    });

    return NextResponse.json({
      ok: true,
      latestWeek,
      weakTopics,
      summaryText,
    });
  } catch (e: any) {
    console.error("weekly-report route error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
