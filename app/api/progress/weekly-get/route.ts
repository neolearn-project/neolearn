// app/api/progress/weekly-get/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

interface WeekAgg {
  weekStart: string;
  weekEnd: string;
  topicsCompleted: number;
  testsTaken: number;
  sumScore: number;
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

    // last 28 days
    const now = new Date();
    const past = new Date(now);
    past.setDate(now.getDate() - 28);
    const pastIso = past.toISOString();

    const { data, error } = await supabase
      .from("topic_progress")
      .select(
        `
          id,
          student_mobile,
          topic_id,
          status,
          last_score,
          tests_taken,
          last_test_at,
          created_at
        `
      )
      .eq("student_mobile", mobile)
      .gte("created_at", pastIso)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("weekly-get supabase error:", error);
      return NextResponse.json(
        { ok: false, error: "DB error while reading topic_progress." },
        { status: 500 }
      );
    }

    // Monday-based week grouping
    const getWeekStart = (d: Date): string => {
      const day = d.getDay(); // 0=Sun
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(d);
      monday.setDate(diff);
      monday.setHours(0, 0, 0, 0);
      return monday.toISOString().substring(0, 10);
    };

    const getWeekEnd = (weekStart: string): string => {
      const d = new Date(`${weekStart}T00:00:00.000Z`);
      d.setDate(d.getDate() + 6);
      return d.toISOString().substring(0, 10);
    };

    const byWeek: Record<string, WeekAgg> = {};

    for (const row of data || []) {
      const created = new Date(row.created_at as string);
      const ws = getWeekStart(created);

      if (!byWeek[ws]) {
        byWeek[ws] = {
          weekStart: ws,
          weekEnd: getWeekEnd(ws),
          topicsCompleted: 0,
          testsTaken: 0,
          sumScore: 0,
        };
      }

      if (row.status === "completed") {
        byWeek[ws].topicsCompleted += 1;
      }

      const s = row.last_score as number | null;
      if (typeof s === "number" && !Number.isNaN(s)) {
        byWeek[ws].testsTaken += 1;
        byWeek[ws].sumScore += s;
      }
    }

    const weeks = Object.values(byWeek)
      .map((w) => ({
        weekStart: w.weekStart,
        weekEnd: w.weekEnd,
        topicsCompleted: w.topicsCompleted,
        testsTaken: w.testsTaken,
        avgScore:
          w.testsTaken > 0 ? Math.round(w.sumScore / w.testsTaken) : null,
      }))
      .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));

    return NextResponse.json({ ok: true, weeks });
  } catch (err) {
    console.error("weekly-get unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
