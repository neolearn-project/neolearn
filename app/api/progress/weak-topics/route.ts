// app/api/progress/weak-topics/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function GET(req: Request) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase server env vars are missing." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const mobile = searchParams.get("mobile");
    const limit = Number(searchParams.get("limit") || "8");

    if (!mobile) {
      return NextResponse.json({ ok: false, error: "mobile is required" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from("topic_progress")
      .select("topic_id, last_score, tests_taken, last_test_at, created_at")
      .eq("student_mobile", mobile)
      .not("last_score", "is", null)
      .order("last_score", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("weak-topics supabase error:", error);
      return NextResponse.json({ ok: false, error: "DB error while reading topic_progress." }, { status: 500 });
    }

    const weakTopics = (data || []).map((r: any) => ({
      topicId: r.topic_id,
      score: r.last_score,
      testsTaken: r.tests_taken ?? 1,
      lastTestAt: r.last_test_at ?? r.created_at,
    }));

    return NextResponse.json({ ok: true, mobile, weakTopics });
  } catch (e: any) {
    console.error("weak-topics route error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
