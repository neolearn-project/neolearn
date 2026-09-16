const NANO_USD_PER_USD = 1_000_000_000n;
const BPS_DENOMINATOR = 10_000n;

export const AI_CREDIT_PRICING_FORMULA_VERSION = "ai-credit-v1-final-ceil";

export function ceilDiv(numerator, denominator) {
  if (denominator <= 0n) {
    throw new RangeError("denominator must be positive");
  }
  if (numerator < 0n) {
    throw new RangeError("numerator must be non-negative");
  }
  return (numerator + denominator - 1n) / denominator;
}

export function calculateAiCreditCharge(input = {}) {
  const fxRateVersion = normalizeVersion(input.fxRateVersion);
  const configVersion = normalizeVersion(input.configVersion);

  const base = {
    providerCostNanoUsd: null,
    calculatedChargeCredits: null,
    chargeCredits: null,
    finalChargeCredits: null,
    pricingStatus: normalizeText(input.pricingStatus),
    pricingReason: normalizeNullableText(input.pricingReason),
    fxRateVersion,
    configVersion,
    formulaVersion: AI_CREDIT_PRICING_FORMULA_VERSION,
    exclusionReason: null,
  };

  const status = base.pricingStatus;

  if (input.success === false) {
    return excluded(base, "failed_usage");
  }

  if (input.authoritativeBilling === false || input.nonAuthoritative === true) {
    return excluded(base, "non_authoritative_usage");
  }

  if (input.clientReported === true) {
    return excluded(base, "client_reported_usage");
  }

  if (status === "unknown") {
    return excluded(base, base.pricingReason || "unknown_usage");
  }

  if (status === "unpriced") {
    return excluded(base, base.pricingReason || "unpriced_usage");
  }

  if (status !== "priced") {
    return excluded(base, "invalid_pricing_status");
  }

  if (!fxRateVersion || !configVersion) {
    return excluded(base, "missing_version_identifier");
  }

  const parsed = parseInputs(input);
  if (!parsed.ok) {
    return excluded(base, parsed.reason);
  }

  const {
    costNanoUsd,
    fxPaisePerUsd,
    fxSafetyBps,
    markupBps,
    creditPaise,
    actionMinimumCredits,
  } = parsed.values;

  const numerator =
    costNanoUsd *
    fxPaisePerUsd *
    fxSafetyBps *
    markupBps;
  const denominator =
    NANO_USD_PER_USD *
    BPS_DENOMINATOR *
    BPS_DENOMINATOR *
    creditPaise;

  const chargeCredits = ceilDiv(numerator, denominator);
  const finalChargeCredits =
    actionMinimumCredits > chargeCredits ? actionMinimumCredits : chargeCredits;

  return {
    ...base,
    providerCostNanoUsd: costNanoUsd.toString(),
    calculatedChargeCredits: chargeCredits.toString(),
    chargeCredits: chargeCredits.toString(),
    finalChargeCredits: finalChargeCredits.toString(),
    exclusionReason: null,
  };
}

function parseInputs(input) {
  const fields = {
    costNanoUsd: { value: input.costNanoUsd, min: 0n },
    fxPaisePerUsd: { value: input.fxPaisePerUsd, min: 1n },
    fxSafetyBps: { value: input.fxSafetyBps, min: 1n },
    markupBps: { value: input.markupBps, min: 1n },
    creditPaise: { value: input.creditPaise, min: 1n },
    actionMinimumCredits: { value: input.actionMinimumCredits, min: 0n },
  };

  const values = {};
  for (const [key, spec] of Object.entries(fields)) {
    const parsed = parseNonNegativeInteger(spec.value);
    if (parsed === null || parsed < spec.min) {
      return { ok: false, reason: `invalid_${key}` };
    }
    values[key] = parsed;
  }

  return { ok: true, values };
}

function parseNonNegativeInteger(value) {
  if (typeof value === "bigint") return value >= 0n ? value : null;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return BigInt(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^(0|[1-9][0-9]*)$/.test(trimmed)) return null;
    return BigInt(trimmed);
  }
  return null;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeNullableText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeVersion(value) {
  const text = String(value || "").trim();
  return text || null;
}

function excluded(base, reason) {
  return {
    ...base,
    exclusionReason: reason,
  };
}
