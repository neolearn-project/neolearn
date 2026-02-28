import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type MasteryRow = {
  subject: string;
  chapter: string;
  topic: string;
  mastery_level: string;
  last_practiced_at: string | null;
};

type WeeklyRow = {
  date: string;
  questions: number;
  minutes: number;
  correct: number;
  incorrect: number;
};

function dayKeyFromIso(input?: string | null): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toMasteryLevel(status: string | null, score: number | null): string {
  if (status === "completed") return "mastered";
  if (typeof score === "number") {
    if (score >= 80) return "mastered";
    if (score < 40) return "weak";
  }
  if (status === "needs_revision") return "weak";
  if (status === "in_progress") return "in_progress";
  return "not_started";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mobile = (url.searchParams.get("mobile") || "").trim();

  if (!mobile) {
    return NextResponse.json({ ok: false, error: "mobile is required" }, { status: 400 });
  }

  let supabase: ReturnType<typeof supabaseAdmin>;
  try {
    supabase = supabaseAdmin();
  } catch {
    return NextResponse.json({
      ok: true,
      student: { mobile, name: null, classId: null },
      mastery: [],
      weakTopics: [],
      weekly: [],
      daily: null,
    });
  }

  let student = { mobile, name: null as string | null, classId: null as string | null };
  try {
    const { data, error } = await supabase
      .from("children")
      .select("child_name,class_number")
      .eq("child_mobile", mobile)
      .maybeSingle();

    if (!error && data) {
      student = {
        mobile,
        name: data.child_name || null,
        classId: data.class_number ? String(data.class_number) : null,
      };
    }
  } catch {
    // fail soft
  }

  let mastery: MasteryRow[] = [];
  const dailyMap: Record<string, WeeklyRow> = {};

  try {
    const { data, error } = await supabase
      .from("topic_progress")
      .select(
        "subject_id,chapter_id,topic_id,status,last_score,tests_taken,last_test_at,updated_at,created_at"
      )
      .eq("student_mobile", mobile)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data)) {
      mastery = data.map((row: any) => {
        const status = row.status ? String(row.status) : null;
        const score = typeof row.last_score === "number" ? row.last_score : null;
        const lastPracticed =
          row.last_test_at || row.updated_at || row.created_at || null;

        return {
          subject: String(row.subject_id ?? ""),
          chapter: String(row.chapter_id ?? ""),
          topic: String(row.topic_id ?? ""),
          mastery_level: toMasteryLevel(status, score),
          last_practiced_at: lastPracticed,
        };
      });

      for (const row of data) {
        const date =
          dayKeyFromIso(row.last_test_at) ||
          dayKeyFromIso(row.updated_at) ||
          dayKeyFromIso(row.created_at);
        if (!date) continue;

        if (!dailyMap[date]) {
          dailyMap[date] = {
            date,
            questions: 0,
            minutes: 0,
            correct: 0,
            incorrect: 0,
          };
        }

        const testsTaken = Number(row.tests_taken || 0);
        const normalizedTests = Number.isFinite(testsTaken) ? Math.max(1, testsTaken) : 1;
        const score = typeof row.last_score === "number" ? row.last_score : null;

        dailyMap[date].questions += normalizedTests;

        if (typeof score === "number" && score >= 40) {
          dailyMap[date].correct += 1;
        } else {
          dailyMap[date].incorrect += 1;
        }
      }
    }
  } catch {
    mastery = [];
  }

  let weakTopics: string[] = [];
  try {
    const weak = mastery
      .filter((m) => m.mastery_level === "weak")
      .map((m) => m.topic)
      .filter(Boolean);
    weakTopics = Array.from(new Set(weak));
  } catch {
    weakTopics = [];
  }

  const weekly = Object.values(dailyMap)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 7);

  const today = new Date().toISOString().slice(0, 10);
  const daily = dailyMap[today] || null;

  return NextResponse.json({
    ok: true,
    student,
    mastery,
    weakTopics,
    weekly,
    daily,
  });
}