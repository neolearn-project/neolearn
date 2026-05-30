import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeAccessSummary } from "@/lib/access/checkPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      return NextResponse.json(
        { ok: false, error: "Missing mobile." },
        { status: 400 }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase admin env missing." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const [
      progressResult,
      overrideResult,
      globalSettingResult,
      studentPolicyResult,
      subscriptionResult,
    ] = await Promise.all([
      supabase
        .from("topic_progress")
        .select("topic_id")
        .eq("student_mobile", mobile),

      supabase
        .from("access_override")
        .select("is_active, expires_at, reason")
        .eq("student_mobile", mobile)
        .maybeSingle(),

      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "student_free_limit")
        .maybeSingle(),

      supabase
        .from("student_access_policy")
        .select("custom_limit")
        .eq("student_mobile", mobile)
        .maybeSingle(),

      supabase
        .from("student_subscriptions")
        .select("*")
        .eq("student_mobile", mobile)
        .eq("payment_status", "paid")
        .order("end_at", { ascending: false }),
    ]);

    if (progressResult.error) {
      return NextResponse.json({ ok: false, error: progressResult.error.message }, { status: 500 });
    }

    if (overrideResult.error) {
      return NextResponse.json({ ok: false, error: overrideResult.error.message }, { status: 500 });
    }

    if (globalSettingResult.error) {
      return NextResponse.json({ ok: false, error: globalSettingResult.error.message }, { status: 500 });
    }

    if (studentPolicyResult.error) {
      return NextResponse.json({ ok: false, error: studentPolicyResult.error.message }, { status: 500 });
    }

    if (subscriptionResult.error) {
      return NextResponse.json({ ok: false, error: subscriptionResult.error.message }, { status: 500 });
    }

    const globalLimit = parseLimit(globalSettingResult.data?.value, FALLBACK_GLOBAL_LIMIT);

    const studentCustomLimit =
      studentPolicyResult.data && studentPolicyResult.data.custom_limit !== null
        ? parseLimit(studentPolicyResult.data.custom_limit, globalLimit)
        : null;

    const effectiveLimit = studentCustomLimit ?? globalLimit;

    const override =
      overrideResult.data && typeof overrideResult.data === "object"
        ? {
            is_active: overrideResult.data.is_active,
            expires_at: overrideResult.data.expires_at,
          }
        : undefined;

    const summary = computeAccessSummary(
      progressResult.data || [],
      effectiveLimit,
      override
    );

    const now = Date.now();
    const subscriptionRows = Array.isArray(subscriptionResult.data)
      ? subscriptionResult.data
      : subscriptionResult.data
      ? [subscriptionResult.data]
      : [];

    const sub = subscriptionRows.find((row: any) => {
      const rowEndMs = parseDbTime(row?.end_at);
      const rowIsPaid = String(row?.payment_status || "").toLowerCase() === "paid";
      const rowIsActiveFlag =
        row?.is_active === true || String(row?.is_active) === "true";

      return (
        rowIsActiveFlag &&
        rowIsPaid &&
        Number.isFinite(rowEndMs) &&
        rowEndMs > now
      );
    }) || null;

    function parseDbTime(value: any) {
      if (!value) return NaN;

      const raw = String(value).trim();

      // Supabase may return timestamp like: 2026-06-29 09:17:36.732+00
      // Convert it to ISO-like format for safer JS parsing.
      const isoLike =
        raw.includes("T") ? raw : raw.replace(" ", "T");

      const parsed = new Date(isoLike).getTime();

      if (Number.isFinite(parsed)) return parsed;

      // Last fallback.
      return new Date(raw).getTime();
    }

    const subEndMs = parseDbTime(sub?.end_at);
    const subIsPaid = String(sub?.payment_status || "").toLowerCase() === "paid";
    const subIsActiveFlag = sub?.is_active === true || String(sub?.is_active) === "true";

    const subscriptionActive =
      !!sub &&
      subIsActiveFlag &&
      subIsPaid &&
      Number.isFinite(subEndMs) &&
      subEndMs > now;

    const allowed = summary.allowed || summary.overrideActive || subscriptionActive;

    return NextResponse.json({
      ok: true,
      allowed,
      used: summary.used,
      limit: summary.limit,
      globalLimit,
      studentCustomLimit,
      effectiveLimit,
      overrideActive: summary.overrideActive,
      overrideReason: overrideResult.data?.reason || null,
      overrideExpiresAt: overrideResult.data?.expires_at || null,
      subscriptionActive,
      subscriptionPlanCode: sub?.plan_code || null,
      reason: subscriptionActive
        ? "paid_subscription"
        : summary.overrideActive
        ? "override"
        : summary.allowed
        ? "free_active"
        : "free_exhausted",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Access check failed." },
      { status: 500 }
    );
  }
}




