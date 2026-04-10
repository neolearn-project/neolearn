import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeAccessSummary } from "@/lib/access/checkPolicy";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const FALLBACK_GLOBAL_LIMIT = 5;

function parseLimit(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

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

    const { data: globalSettingRow, error: globalSettingError } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "student_free_limit")
      .maybeSingle();

    if (globalSettingError) {
      return NextResponse.json(
        { ok: false, error: globalSettingError.message },
        { status: 500 }
      );
    }

    const { data: studentPolicyRow, error: studentPolicyError } = await supabase
      .from("student_access_policy")
      .select("custom_limit")
      .eq("student_mobile", mobile)
      .maybeSingle();

    if (studentPolicyError) {
      return NextResponse.json(
        { ok: false, error: studentPolicyError.message },
        { status: 500 }
      );
    }

    const globalLimit = parseLimit(globalSettingRow?.value, FALLBACK_GLOBAL_LIMIT);
    const studentCustomLimit =
      studentPolicyRow && studentPolicyRow.custom_limit !== null
        ? parseLimit(studentPolicyRow.custom_limit, globalLimit)
        : null;

    const effectiveLimit = studentCustomLimit ?? globalLimit;

    const override =
      overrideRow && typeof overrideRow === "object"
        ? {
            is_active: overrideRow.is_active,
            expires_at: overrideRow.expires_at,
          }
        : undefined;

    const summary = computeAccessSummary(progressRows || [], effectiveLimit, override);

    return NextResponse.json({
      ok: true,
      allowed: summary.allowed,
      used: summary.used,
      limit: summary.limit,
      globalLimit,
      studentCustomLimit,
      effectiveLimit,
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