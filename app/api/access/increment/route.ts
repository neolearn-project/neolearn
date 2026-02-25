import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { mobile } = await req.json();

  if (!mobile) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];

  const { data: existing } = await supabase
    .from("student_daily_usage")
    .select("*")
    .eq("student_mobile", mobile)
    .eq("date", today)
    .single();

  if (!existing) {
    await supabase.from("student_daily_usage").insert({
      student_mobile: mobile,
      date: today,
      lessons_used: 1,
    });
  } else {
    await supabase
      .from("student_daily_usage")
      .update({ lessons_used: existing.lessons_used + 1 })
      .eq("id", existing.id);
  }

  return NextResponse.json({ ok: true });
}