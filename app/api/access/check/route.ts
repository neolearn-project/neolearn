import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mobile = String(searchParams.get("mobile") || "").trim();

    if (!mobile) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data } = await supabase
      .from("topic_progress")
      .select("topic_id")
      .eq("student_mobile", mobile);

    const used = new Set((data || []).map((r: any) => r.topic_id)).size;
    const limit = 5;

    return NextResponse.json({
      ok: true,
      allowed: used < limit,
      used,
      limit,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
