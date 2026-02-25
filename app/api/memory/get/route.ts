import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { mobile, topicId } = await req.json();

  if (!mobile || !topicId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { data } = await supabase
    .from("student_learning_memory")
    .select("*")
    .eq("student_mobile", mobile)
    .eq("topic_id", topicId)
    .single();

  return NextResponse.json({ ok: true, memory: data ?? null });
}