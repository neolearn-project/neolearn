import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mobile = searchParams.get("mobile");

  if (!mobile) {
    return NextResponse.json({ ok: false, error: "Missing mobile" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];

  // Get plan
  const { data: plan } = await supabase
    .from("student_plans")
    .select("*")
    .eq("student_mobile", mobile)
    .eq("is_active", true)
    .single();

  const dailyLimit = plan?.daily_limit ?? 3;
  const planType = plan?.plan_type ?? "free";

  // Get today's usage
  const { data: usage } = await supabase
    .from("student_daily_usage")
    .select("*")
    .eq("student_mobile", mobile)
    .eq("date", today)
    .single();

  const used = usage?.lessons_used ?? 0;
  const allowed = used < dailyLimit;

  return NextResponse.json({
    ok: true,
    allowed,
    used,
    limit: dailyLimit,
    plan: planType,
  });
}