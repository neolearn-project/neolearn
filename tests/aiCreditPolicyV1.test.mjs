import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_CREDIT_POLICY_V1, calculateGrantTranches, calculatePositiveProratedUpgrade,
  evaluateAiCreditLimits, istDayKey, validateAiCreditPolicy,
} from "../app/lib/aiCreditPolicyV1.mjs";

test("approved policy is valid and inactive", () => {
  assert.deepEqual(validateAiCreditPolicy(), { ok: true, errors: [] });
  assert.equal(AI_CREDIT_POLICY_V1.active, false);
  assert.equal(Object.hasOwn(AI_CREDIT_POLICY_V1.plans.TRIAL, "termDays"), false);
  assert.deepEqual(AI_CREDIT_POLICY_V1.plans.REGULAR_QUARTERLY,
    { total: 36000, rolling5h: 1200, daily: 2400, termDays: 90, tranches: 3 });
});

test("quarterly grants are three deterministic 12000 tranches", () => {
  const grants = calculateGrantTranches("REGULAR_QUARTERLY", "2026-01-01T00:00:00.000Z");
  assert.deepEqual(grants.map((grant) => grant.credits), [12000, 12000, 12000]);
  assert.equal(grants[1].availableAt, "2026-01-31T00:00:00.000Z");
});

test("limits distinguish rolling, daily and term exhaustion", () => {
  assert.equal(evaluateAiCreditLimits({ planCode: "TRIAL", totalUsed: 0, rolling5hUsed: 90, dailyUsed: 90, charge: 11 }).reason, "rolling_5h_limit");
  assert.equal(evaluateAiCreditLimits({ planCode: "TRIAL", totalUsed: 190, rolling5hUsed: 10, dailyUsed: 190, charge: 11 }).reason, "daily_limit");
  assert.equal(evaluateAiCreditLimits({ planCode: "TRIAL", totalUsed: 495, rolling5hUsed: 0, dailyUsed: 0, charge: 6 }).reason, "term_limit");
  assert.equal(evaluateAiCreditLimits({ planCode: "TRIAL", totalUsed: 0, rolling5hUsed: 0, dailyUsed: 0, charge: 100 }).allowed, true);
});

test("IST daily key resets at midnight", () => {
  assert.equal(istDayKey("2026-01-01T18:29:59.999Z"), "2026-01-01");
  assert.equal(istDayKey("2026-01-01T18:30:00.000Z"), "2026-01-02");
});

test("upgrade grants only the positive prorated difference", () => {
  assert.equal(calculatePositiveProratedUpgrade({ oldTotal: 12000, newTotal: 30000, remainingSeconds: 15, termSeconds: 30 }), 9000);
  assert.equal(calculatePositiveProratedUpgrade({ oldTotal: 30000, newTotal: 12000, remainingSeconds: 15, termSeconds: 30 }), 0);
});
