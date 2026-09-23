export const AI_CREDIT_POLICY_VERSION = "ai-credit-policy-v1-2026-09-22";
export const AI_CREDIT_TIMEZONE = "Asia/Kolkata";

export const AI_CREDIT_POLICY_V1 = Object.freeze({
  version: AI_CREDIT_POLICY_VERSION,
  active: false,
  creditPaise: 1,
  fxPaisePerUsd: 9500,
  fxSafetyBps: 11000,
  markupBps: 25000,
  reservationTtlSeconds: 900,
  actionMinimumCredits: Object.freeze({
    lesson_generation: 40, notes: 40, topic_tests: 30, teacher_quiz: 30,
    teacher_qa: 20, teacher_math: 25, memory_embedding: 1,
    lesson_audio: 0, teacher_math_audio: 0, avatar_lesson: 0,
    realtime_voice_session: 0, realtime_voice: 0,
  }),
  plans: Object.freeze({
    TRIAL: Object.freeze({ total: 500, rolling5h: 100, daily: 200, tranches: 1 }),
    REGULAR_MONTHLY: Object.freeze({ total: 12000, rolling5h: 1200, daily: 2400, termDays: 30, tranches: 1 }),
    REGULAR_QUARTERLY: Object.freeze({ total: 36000, rolling5h: 1200, daily: 2400, termDays: 90, tranches: 3 }),
    COMPETITIVE_MONTHLY: Object.freeze({ total: 30000, rolling5h: 3000, daily: 6000, termDays: 30, tranches: 1 }),
  }),
  nonBillableFeatures: Object.freeze([
    "lesson_audio", "teacher_math_audio", "avatar_lesson",
    "realtime_voice_session", "realtime_voice",
  ]),
});

export function validateAiCreditPolicy(policy = AI_CREDIT_POLICY_V1) {
  const errors = [];
  if (!policy || typeof policy !== "object") return { ok: false, errors: ["policy_required"] };
  if (policy.active !== false) errors.push("policy_must_default_inactive");
  for (const key of ["creditPaise", "fxPaisePerUsd", "fxSafetyBps", "markupBps", "reservationTtlSeconds"]) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] <= 0) errors.push(`invalid_${key}`);
  }
  if (policy.reservationTtlSeconds < 300 || policy.reservationTtlSeconds > 86400) errors.push("invalid_reservation_ttl");
  for (const [code, plan] of Object.entries(policy.plans || {})) {
    for (const key of ["total", "rolling5h", "daily", "tranches"]) {
      if (!Number.isSafeInteger(plan[key]) || plan[key] <= 0) errors.push(`${code}_invalid_${key}`);
    }
    if (code !== "TRIAL" && (!Number.isSafeInteger(plan.termDays) || plan.termDays <= 0)) {
      errors.push(`${code}_invalid_termDays`);
    }
    if (plan.rolling5h > plan.daily || plan.daily > plan.total) errors.push(`${code}_limit_order`);
    if (plan.total % plan.tranches !== 0) errors.push(`${code}_tranche_divisibility`);
  }
  const required = ["TRIAL", "REGULAR_MONTHLY", "REGULAR_QUARTERLY", "COMPETITIVE_MONTHLY"];
  for (const code of required) if (!policy.plans?.[code]) errors.push(`missing_${code}`);
  return { ok: errors.length === 0, errors };
}

export function calculateGrantTranches(planCode, startAt, policy = AI_CREDIT_POLICY_V1) {
  const plan = policy.plans?.[String(planCode || "").toUpperCase()];
  const start = new Date(startAt);
  if (!plan || Number.isNaN(start.getTime())) throw new RangeError("invalid plan or start time");
  const amount = plan.total / plan.tranches;
  return Array.from({ length: plan.tranches }, (_, index) => ({
    index,
    credits: amount,
    availableAt: new Date(start.getTime() + index * 30 * 86400000).toISOString(),
  }));
}

export function calculatePositiveProratedUpgrade({ oldTotal, newTotal, remainingSeconds, termSeconds }) {
  for (const value of [oldTotal, newTotal, remainingSeconds, termSeconds]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("upgrade inputs must be non-negative safe integers");
  }
  if (termSeconds === 0 || newTotal <= oldTotal || remainingSeconds === 0) return 0;
  return Math.ceil(((newTotal - oldTotal) * Math.min(remainingSeconds, termSeconds)) / termSeconds);
}

export function istDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("invalid time");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AI_CREDIT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function evaluateAiCreditLimits({ planCode, totalUsed, rolling5hUsed, dailyUsed, charge }, policy = AI_CREDIT_POLICY_V1) {
  const plan = policy.plans?.[String(planCode || "").toUpperCase()];
  if (!plan) return { allowed: false, reason: "unknown_plan" };
  const values = { totalUsed, rolling5hUsed, dailyUsed, charge };
  if (Object.values(values).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    return { allowed: false, reason: "invalid_usage" };
  }
  if (totalUsed + charge > plan.total) return { allowed: false, reason: "term_limit" };
  if (rolling5hUsed + charge > plan.rolling5h) return { allowed: false, reason: "rolling_5h_limit" };
  if (dailyUsed + charge > plan.daily) return { allowed: false, reason: "daily_limit" };
  return { allowed: true, reason: null };
}
