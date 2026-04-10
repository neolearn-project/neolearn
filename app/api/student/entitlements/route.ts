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

function getSupabase() {
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing.");
  if (!supabaseServiceKey) throw new Error("SUPABASE service role key missing.");
  return createClient(supabaseUrl, supabaseServiceKey);
}

function indexFlags(rows: Array<{ key: string; enabled: boolean }> = []) {
  const map = new Map<string, boolean>();
  for (const row of rows) map.set(row.key, !!row.enabled);
  return (key: string, fallback = true) =>
    map.has(key) ? !!map.get(key) : fallback;
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

    const supabase = getSupabase();

    const [
      progressResult,
      overrideResult,
      globalLimitResult,
      studentPolicyResult,
      subscriptionResult,
      flagsResult,
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
        .eq("is_active", true)
        .eq("payment_status", "paid")
        .order("end_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from("feature_flags")
        .select("key, enabled"),
    ]);

    if (progressResult.error) {
      return NextResponse.json({ ok: false, error: progressResult.error.message }, { status: 500 });
    }
    if (overrideResult.error) {
      return NextResponse.json({ ok: false, error: overrideResult.error.message }, { status: 500 });
    }
    if (globalLimitResult.error) {
      return NextResponse.json({ ok: false, error: globalLimitResult.error.message }, { status: 500 });
    }
    if (studentPolicyResult.error) {
      return NextResponse.json({ ok: false, error: studentPolicyResult.error.message }, { status: 500 });
    }
    if (subscriptionResult.error) {
      return NextResponse.json({ ok: false, error: subscriptionResult.error.message }, { status: 500 });
    }
    if (flagsResult.error) {
      return NextResponse.json({ ok: false, error: flagsResult.error.message }, { status: 500 });
    }

    const globalLimit = parseLimit(globalLimitResult.data?.value, FALLBACK_GLOBAL_LIMIT);
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

    const summary = computeAccessSummary(progressResult.data || [], effectiveLimit, override);

    const now = Date.now();
    const sub = subscriptionResult.data;
    const subscriptionActive =
      !!sub &&
      !!sub.is_active &&
      sub.payment_status === "paid" &&
      new Date(sub.end_at).getTime() > now;

    const hasPaidAccess = summary.overrideActive || subscriptionActive;
    const hasFreeAccess = !hasPaidAccess && summary.allowed;
    const freeExhausted = !hasPaidAccess && !summary.allowed;

    const isEnabled = indexFlags(flagsResult.data || []);

    return NextResponse.json({
      ok: true,

      usage: {
        used: summary.used,
        globalLimit,
        studentCustomLimit,
        effectiveLimit,
      },

      override: {
        active: summary.overrideActive,
        reason: overrideResult.data?.reason || null,
        expiresAt: overrideResult.data?.expires_at || null,
      },

      subscription: {
        active: subscriptionActive,
        planCode: sub?.plan_code || null,
        startAt: sub?.start_at || null,
        endAt: sub?.end_at || null,
        paymentStatus: sub?.payment_status || null,
      },

      state: {
        hasPaidAccess,
        hasFreeAccess,
        freeExhausted,
      },

     features: {
  dashboard: true,
  progress: true,
  history: true,
  weakTopics: true,
  pricing: true,
  subscriptionStatus: true,

  lessonGeneration:
    isEnabled("lesson_generation_enabled") &&
    (hasPaidAccess || hasFreeAccess),

  lessonAudio:
    isEnabled("lesson_audio_enabled") &&
    (hasPaidAccess || hasFreeAccess),

  teacherQa:
    isEnabled("teacher_qa_enabled") &&
    (hasPaidAccess || hasFreeAccess),

  teacherQaPreview:
    isEnabled("teacher_qa_enabled") &&
    freeExhausted,

  realtimeVoice:
    isEnabled("realtime_voice_enabled") &&
    hasPaidAccess,

  topicTest:
    isEnabled("topic_test_enabled") &&
    (hasPaidAccess || hasFreeAccess),

  smartBoard:
    isEnabled("smartboard_enabled") &&
    (hasPaidAccess || hasFreeAccess),

  freePreview:
    isEnabled("free_preview_enabled") &&
    freeExhausted,

  payments:
    isEnabled("payments_enabled", true),
},

      reason:
        hasPaidAccess
          ? "paid_or_override"
          : hasFreeAccess
          ? "free_active"
          : "free_exhausted",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to resolve entitlements." },
      { status: 500 }
    );
  }
}