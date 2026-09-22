import { computeAccessSummary } from "@/lib/access/checkPolicy";
import { isPaidSubscriptionActive } from "@/lib/access/subscriptionPeriod.mjs";
import { OwnershipError } from "@/lib/auth/ownership";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AiFeature = "lesson_generation" | "lesson_audio" | "teacher_qa" | "teacher_math" | "topic_test";

const flagKeys: Record<AiFeature, string> = {
  lesson_generation: "lesson_generation_enabled",
  lesson_audio: "lesson_audio_enabled",
  teacher_qa: "teacher_qa_enabled",
  teacher_math: "teacher_qa_enabled",
  topic_test: "topic_test_enabled",
};

export async function requireAiAccess(mobile: string, feature: AiFeature) {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const [progress, override, globalLimit, policy, subscription, flag] = await Promise.all([
    db.from("topic_progress").select("topic_id").eq("student_mobile", mobile),
    db.from("access_override").select("is_active, expires_at").eq("student_mobile", mobile).maybeSingle(),
    db.from("app_settings").select("value").eq("key", "student_free_limit").maybeSingle(),
    db.from("student_access_policy").select("custom_limit").eq("student_mobile", mobile).maybeSingle(),
    db.from("student_subscriptions").select("*").eq("student_mobile", mobile)
      .eq("is_active", true).eq("payment_status", "paid")
      .lte("start_at", now).gt("end_at", now)
      .order("end_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("feature_flags").select("key, enabled").eq("key", flagKeys[feature]).maybeSingle(),
  ]);
  if ([progress, override, globalLimit, policy, subscription, flag].some((result) => result.error)) {
    throw new OwnershipError("Unable to verify student access.", 500);
  }
  const parseLimit = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const global = parseLimit(globalLimit.data?.value, 5);
  const limit = policy.data?.custom_limit == null
    ? global : parseLimit(policy.data.custom_limit, global);
  const summary = computeAccessSummary(progress.data || [], limit, override.data);
  const allowed = summary.allowed || summary.overrideActive || isPaidSubscriptionActive(subscription.data, now);
  const featureEnabled = flag.data ? !!flag.data.enabled : true;
  if (!featureEnabled || !allowed) {
    throw new OwnershipError("Student access denied.", 403);
  }
}
