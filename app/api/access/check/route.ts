import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeAccessSummary } from "@/lib/access/checkPolicy";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mobile = String(searchParams.get("mobile") || "").trim();

    if (!mobile) {
      return NextResponse.json({ ok: false, error: "Missing mobile." }, { status: 400 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase admin env missing." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: progressRows, error: progressError } = await supabase
      .from("topic_progress")
      .select("topic_id")
      .eq("student_mobile", mobile);

    if (progressError) {
      return NextResponse.json(
        { ok: false, error: progressError.message },
        { status: 500 }
      );
    }

    const { data: overrideRow, error: overrideError } = await supabase
      .from("access_override")
      .select("is_active, expires_at, reason")
      .eq("student_mobile", mobile)
      .maybeSingle();

    if (overrideError) {
      return NextResponse.json(
        { ok: false, error: overrideError.message },
        { status: 500 }
      );
    }

    const summary = computeAccessSummary(progressRows || [], 5, overrideRow || null);

    return NextResponse.json({
      ok: true,
      allowed: summary.allowed,
      used: summary.used,
      limit: summary.limit,
      overrideActive: summary.overrideActive,
      overrideReason: overrideRow?.reason || null,
      overrideExpiresAt: overrideRow?.expires_at || null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Access check failed." },
      { status: 500 }
    );
  }
}