// app/api/progress/daily-get/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// IST offset in minutes
const IST_OFFSET_MIN = 330;

function getISTDayRangeUTC(now = new Date()) {
  // Convert "now" to IST clock by adding offset
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);

  // Start of IST day
  const startIST = new Date(ist);
  startIST.setHours(0, 0, 0, 0);

  // End of IST day (exclusive)
  const endIST = new Date(startIST);
  endIST.setDate(endIST.getDate() + 1);

  // Convert IST boundaries back to UTC timestamps for querying stored UTC timestamps
  const startUTC = new Date(startIST.getTime() - IST_OFFSET_MIN * 60_000);
  const endUTC = new Date(endIST.getTime() - IST_OFFSET_MIN * 60_000);

  // Also return the IST date label (YYYY-MM-DD)
  const istDate = startIST.toISOString().slice(0, 10);

  return { startUTC, endUTC, istDate };
}

export async function GET(req: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase server env vars are missing." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const mobile = searchParams.get("mobile");
    if (!mobile) {
      return NextResponse.json(
        { ok: false, error: "Missing ?mobile= query parameter." },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { startUTC, endUTC, istDate } = getISTDayRangeUTC(new Date());
    const startIso = startUTC.toISOString();
    const endIso = endUTC.toISOString();

    // Pull only needed fields
    const { data, error } = await supabase
      .from("topic_progress")
      .select("status,last_score,last_test_at,created_at")
      .eq("student_mobile", mobile)
      // anything created today OR tested today.
      // We'll just fetch rows whose created_at is in today’s range OR last_test_at is in today’s range.
      // Supabase doesn't support OR cleanly without .or(), so use .or()
      .or(
        `created_at.gte.${startIso},created_at.lt.${endIso},last_test_at.gte.${startIso},last_test_at.lt.${endIso}`
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("daily-get supabase error:", error);
      return NextResponse.json(
        { ok: false, error: "DB error while reading topic_progress." },
        { status: 500 }
      );
    }

    let topicsCompleted = 0;
    let testsTaken = 0;
    let sumScore = 0;

    for (const row of data || []) {
      // Topics completed today: count "completed" rows created today (IST-day)
      if (row.status === "completed") {
        const created = new Date(row.created_at as string);
        if (created >= startUTC && created < endUTC) topicsCompleted += 1;
      }

      // Tests taken today: count rows with last_test_at today (IST-day)
      const lastTestAt = row.last_test_at ? new Date(row.last_test_at as string) : null;
      if (lastTestAt && lastTestAt >= startUTC && lastTestAt < endUTC) {
        testsTaken += 1;

        const s = row.last_score as number | null;
        if (typeof s === "number" && !Number.isNaN(s)) sumScore += s;
      }
    }

    const avgScore =
      testsTaken > 0 ? Math.round(sumScore / testsTaken) : null;

    return NextResponse.json({
      ok: true,
      date: istDate, // IST date label
      topicsCompleted,
      testsTaken,
      avgScore,
    });
  } catch (err) {
    console.error("daily-get unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
