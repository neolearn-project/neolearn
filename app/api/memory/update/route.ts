import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { mobile, topicId, delta } = await req.json();

  if (!mobile || !topicId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("student_learning_memory")
    .select("*")
    .eq("student_mobile", mobile)
    .eq("topic_id", topicId)
    .single();

  if (!existing) {
    await supabase.from("student_learning_memory").insert({
      student_mobile: mobile,
      topic_id: topicId,
      mastery_level: 50 + (delta ?? 0),
      last_practiced_at: new Date().toISOString(),
    });
  } else {
    const newLevel = Math.max(
      0,
      Math.min(100, existing.mastery_level + (delta ?? 5))
    );

    await supabase
      .from("student_learning_memory")
      .update({
        mastery_level: newLevel,
        last_practiced_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  }

  return NextResponse.json({ ok: true });
}