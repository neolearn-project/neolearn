import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAiCreditCharge,
  ceilDiv,
} from "../app/lib/aiCreditPricing.mjs";

const baseConfig = Object.freeze({
  fxPaisePerUsd: "8300",
  fxSafetyBps: "10000",
  markupBps: "25000",
  creditPaise: "1",
  actionMinimumCredits: "0",
  fxRateVersion: "synthetic-fx-v1",
  configVersion: "test-credit-config-v1",
  pricingStatus: "priced",
  success: true,
  authoritativeBilling: true,
});

function priced(overrides = {}) {
  return calculateAiCreditCharge({
    ...baseConfig,
    costNanoUsd: "1000000",
    ...overrides,
  });
}

test("production sample uses synthetic FX without double rounding", () => {
  const result = priced({
    costNanoUsd: "2261500",
    fxPaisePerUsd: "8300",
    fxSafetyBps: "10000",
    markupBps: "25000",
  });

  assert.equal(result.providerCostNanoUsd, "2261500");
  assert.equal(result.calculatedChargeCredits, "47");
  assert.equal(result.chargeCredits, "47");
  assert.equal(result.finalChargeCredits, "47");
  assert.equal(result.fxRateVersion, "synthetic-fx-v1");
  assert.equal(result.configVersion, "test-credit-config-v1");
  assert.equal(result.exclusionReason, null);
});

test("exact ceiling behavior rounds once at the final denominator", () => {
  const result = priced({
    costNanoUsd: "1",
    fxPaisePerUsd: "1",
    fxSafetyBps: "10000",
    markupBps: "10000",
  });

  assert.equal(result.calculatedChargeCredits, "1");
  assert.equal(ceilDiv(1n, 1_000_000_000n).toString(), "1");
});

test("separate FX safety and 2.5x markup are both applied", () => {
  const withoutFxSafety = priced({
    costNanoUsd: "1000000000",
    fxPaisePerUsd: "100",
    fxSafetyBps: "10000",
    markupBps: "25000",
  });
  const withFxSafety = priced({
    costNanoUsd: "1000000000",
    fxPaisePerUsd: "100",
    fxSafetyBps: "11000",
    markupBps: "25000",
  });

  assert.equal(withoutFxSafety.calculatedChargeCredits, "250");
  assert.equal(withFxSafety.calculatedChargeCredits, "275");
});

test("action minimum wins when greater than calculated charge", () => {
  const result = priced({
    costNanoUsd: "1000000",
    fxPaisePerUsd: "100",
    actionMinimumCredits: "10",
  });

  assert.equal(result.calculatedChargeCredits, "1");
  assert.equal(result.finalChargeCredits, "10");
});

test("calculated charge wins when action minimum is lower", () => {
  const result = priced({
    costNanoUsd: "1000000000",
    fxPaisePerUsd: "100",
    actionMinimumCredits: "10",
  });

  assert.equal(result.calculatedChargeCredits, "250");
  assert.equal(result.finalChargeCredits, "250");
});

test("unknown and unpriced usage are excluded from charges", () => {
  const unknown = priced({
    pricingStatus: "unknown",
    pricingReason: "missing_usage",
    costNanoUsd: null,
    actionMinimumCredits: "10",
  });
  const unpriced = priced({
    pricingStatus: "unpriced",
    pricingReason: "unknown_model",
    actionMinimumCredits: "10",
  });

  assert.equal(unknown.finalChargeCredits, null);
  assert.equal(unknown.exclusionReason, "missing_usage");
  assert.equal(unpriced.finalChargeCredits, null);
  assert.equal(unpriced.exclusionReason, "unknown_model");
});

test("non-authoritative realtime usage is excluded", () => {
  const result = priced({
    authoritativeBilling: false,
    pricingReason: "client_reported_not_authoritative",
  });

  assert.equal(result.chargeCredits, null);
  assert.equal(result.finalChargeCredits, null);
  assert.equal(result.exclusionReason, "non_authoritative_usage");
});

test("client-reported usage is excluded", () => {
  const result = priced({
    clientReported: true,
  });

  assert.equal(result.finalChargeCredits, null);
  assert.equal(result.exclusionReason, "client_reported_usage");
});

test("TTS proxy-only usage is excluded", () => {
  const result = priced({
    pricingStatus: "unknown",
    pricingReason: "tts_proxy_characters_only",
    costNanoUsd: null,
  });

  assert.equal(result.finalChargeCredits, null);
  assert.equal(result.exclusionReason, "tts_proxy_characters_only");
});

test("failed usage is excluded", () => {
  const result = priced({
    success: false,
    actionMinimumCredits: "10",
  });

  assert.equal(result.finalChargeCredits, null);
  assert.equal(result.exclusionReason, "failed_usage");
});

test("zero authoritative priced cost still applies the action minimum", () => {
  const result = priced({
    costNanoUsd: "0",
    actionMinimumCredits: "7",
  });

  assert.equal(result.calculatedChargeCredits, "0");
  assert.equal(result.finalChargeCredits, "7");
});

test("very large values preserve precision beyond Number safety", () => {
  const result = priced({
    costNanoUsd: "900719925474099312345",
    fxPaisePerUsd: "987654321",
    fxSafetyBps: "12345",
    markupBps: "25000",
    actionMinimumCredits: "0",
  });

  const expected = ceilDiv(
    900719925474099312345n * 987654321n * 12345n * 25000n,
    1_000_000_000n * 10_000n * 10_000n
  ).toString();

  assert.equal(result.calculatedChargeCredits, expected);
  assert.equal(result.finalChargeCredits, expected);
});

test("invalid or negative integer inputs are rejected safely", () => {
  const malformed = priced({ costNanoUsd: "12.3" });
  const negative = priced({ fxPaisePerUsd: "-1" });
  const unsafeNumber = priced({ costNanoUsd: Number.MAX_SAFE_INTEGER + 1 });

  assert.equal(malformed.finalChargeCredits, null);
  assert.equal(malformed.exclusionReason, "invalid_costNanoUsd");
  assert.equal(negative.finalChargeCredits, null);
  assert.equal(negative.exclusionReason, "invalid_fxPaisePerUsd");
  assert.equal(unsafeNumber.finalChargeCredits, null);
  assert.equal(unsafeNumber.exclusionReason, "invalid_costNanoUsd");
});

test("version identifiers are required for priced authoritative charges", () => {
  const result = priced({
    fxRateVersion: "",
  });

  assert.equal(result.finalChargeCredits, null);
  assert.equal(result.exclusionReason, "missing_version_identifier");
});
