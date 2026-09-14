export const AI_USAGE_PRICE_VERSION = "openai-2026-09-12-v1";

const NANO_USD_PER_USD = 1_000_000_000n;
const UNITS_PER_MILLION = 1_000_000n;

function usdPerMillionToNanoUsd(value) {
  const [whole, fraction = ""] = String(value).split(".");
  const padded = `${fraction}000000000`.slice(0, 9);
  return BigInt(whole || "0") * NANO_USD_PER_USD + BigInt(padded);
}

function bigintToString(value) {
  return typeof value === "bigint" ? value.toString() : String(value);
}

export const OPENAI_MODEL_PRICES = Object.freeze({
  "gpt-5.1": {
    kind: "text",
    inputNanoUsdPerMillion: usdPerMillionToNanoUsd("1.25"),
    cachedInputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.125"),
    outputNanoUsdPerMillion: usdPerMillionToNanoUsd("10.00"),
  },
  "gpt-5-mini": {
    kind: "text",
    inputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.25"),
    cachedInputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.025"),
    outputNanoUsdPerMillion: usdPerMillionToNanoUsd("2.00"),
  },
  "gpt-5-nano": {
    kind: "text",
    inputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.05"),
    cachedInputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.005"),
    outputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.40"),
  },
  "gpt-4.1-mini": {
    kind: "text",
    inputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.40"),
    cachedInputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.10"),
    outputNanoUsdPerMillion: usdPerMillionToNanoUsd("1.60"),
  },
  "text-embedding-3-small": {
    kind: "embedding",
    inputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.02"),
  },
  "gpt-4o-mini-tts": {
    kind: "tts",
    inputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.60"),
    audioOutputNanoUsdPerMillion: usdPerMillionToNanoUsd("12.00"),
  },
  "gpt-realtime-mini": {
    kind: "realtime",
    inputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.60"),
    cachedInputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.06"),
    outputNanoUsdPerMillion: usdPerMillionToNanoUsd("2.40"),
    audioInputNanoUsdPerMillion: usdPerMillionToNanoUsd("10.00"),
    cachedAudioInputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.30"),
    audioOutputNanoUsdPerMillion: usdPerMillionToNanoUsd("20.00"),
  },
  "gpt-4o-mini-realtime-preview": {
    kind: "realtime",
    inputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.60"),
    cachedInputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.30"),
    outputNanoUsdPerMillion: usdPerMillionToNanoUsd("2.40"),
    audioInputNanoUsdPerMillion: usdPerMillionToNanoUsd("10.00"),
    cachedAudioInputNanoUsdPerMillion: usdPerMillionToNanoUsd("0.30"),
    audioOutputNanoUsdPerMillion: usdPerMillionToNanoUsd("20.00"),
  },
});

export function normalizeOpenAIModel(model) {
  const value = String(model || "").trim();
  if (!value) return "";
  if (value.startsWith("gpt-4o-mini-realtime-preview")) {
    return "gpt-4o-mini-realtime-preview";
  }
  return value;
}

export function buildAiUsageIdempotencyKey({ requestId, feature, providerCall, retryAttempt = 0 }) {
  return [
    String(requestId || ""),
    String(feature || ""),
    String(providerCall || ""),
    String(Number.isFinite(Number(retryAttempt)) ? Number(retryAttempt) : 0),
  ].join(":");
}

export function clientReportedRealtimeUsagePolicy() {
  return {
    metadata: {
      usage_source: "client_reported",
      client_reported: true,
    },
    authoritativeBilling: false,
    pricingStatusOverride: "unknown",
    pricingReasonOverride: "client_reported_not_authoritative",
  };
}

export function extractOpenAIUsage(raw) {
  const usage = raw?.usage || raw?.response?.usage || raw?.data?.usage || null;
  if (!usage || typeof usage !== "object") return null;

  const inputTokens = numberOrNull(usage.input_tokens ?? usage.prompt_tokens);
  const outputTokens = numberOrNull(usage.output_tokens ?? usage.completion_tokens);
  const totalTokens = numberOrNull(usage.total_tokens);

  const inputDetails = usage.input_tokens_details || usage.prompt_tokens_details || {};
  const outputDetails = usage.output_tokens_details || usage.completion_tokens_details || {};

  const cachedInputTokens = numberOrZero(inputDetails.cached_tokens);
  const cachedAudioInputTokens = numberOrZero(inputDetails.cached_audio_tokens);
  const audioInputTokens = numberOrZero(inputDetails.audio_tokens);
  const audioOutputTokens = numberOrZero(outputDetails.audio_tokens);
  const reasoningTokens = numberOrZero(outputDetails.reasoning_tokens);

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    audioInputTokens,
    cachedAudioInputTokens,
    audioOutputTokens,
  };
}

export function extractOpenAIResponseId(raw) {
  return (
    raw?.id ||
    raw?.response?.id ||
    raw?.data?.id ||
    raw?._request_id ||
    null
  );
}

export function calculateOpenAICost(model, usage) {
  const normalizedModel = normalizeOpenAIModel(model);
  const price = OPENAI_MODEL_PRICES[normalizedModel];
  if (!price) {
    return {
      priceVersion: AI_USAGE_PRICE_VERSION,
      pricingStatus: "unpriced",
      costNanoUsd: null,
      reason: "unknown_model",
    };
  }

  if (!usage || typeof usage !== "object") {
    return {
      priceVersion: AI_USAGE_PRICE_VERSION,
      pricingStatus: "unknown",
      costNanoUsd: null,
      reason: "missing_usage",
    };
  }

  const inputTokens = usage.inputTokens;
  const outputTokens = usage.outputTokens;
  const cachedInputTokens = usage.cachedInputTokens || 0;
  const audioInputTokens = usage.audioInputTokens || 0;
  const cachedAudioInputTokens = usage.cachedAudioInputTokens || 0;
  const audioOutputTokens = usage.audioOutputTokens || 0;
  const ttsCharacters = usage.ttsCharacters;

  if (price.kind === "tts" && Number.isFinite(ttsCharacters) && inputTokens == null && audioOutputTokens === 0) {
    return {
      priceVersion: AI_USAGE_PRICE_VERSION,
      pricingStatus: "unknown",
      costNanoUsd: null,
      reason: "tts_proxy_characters_only",
    };
  }

  if (inputTokens == null && outputTokens == null && audioInputTokens === 0 && audioOutputTokens === 0) {
    return {
      priceVersion: AI_USAGE_PRICE_VERSION,
      pricingStatus: "unknown",
      costNanoUsd: null,
      reason: "missing_usage",
    };
  }

  let cost = 0n;

  if (inputTokens != null) {
    const cached = Math.min(cachedInputTokens, inputTokens);
    const uncached = Math.max(inputTokens - cached, 0);
    cost += perMillionCost(uncached, price.inputNanoUsdPerMillion);
    cost += perMillionCost(cached, price.cachedInputNanoUsdPerMillion ?? price.inputNanoUsdPerMillion);
  }

  if (outputTokens != null) {
    cost += perMillionCost(outputTokens, price.outputNanoUsdPerMillion ?? 0n);
  }

  if (audioInputTokens) {
    const cachedAudio = Math.min(cachedAudioInputTokens, audioInputTokens);
    const uncachedAudio = Math.max(audioInputTokens - cachedAudio, 0);
    cost += perMillionCost(uncachedAudio, price.audioInputNanoUsdPerMillion ?? price.inputNanoUsdPerMillion ?? 0n);
    cost += perMillionCost(cachedAudio, price.cachedAudioInputNanoUsdPerMillion ?? price.audioInputNanoUsdPerMillion ?? 0n);
  }

  if (audioOutputTokens) {
    cost += perMillionCost(audioOutputTokens, price.audioOutputNanoUsdPerMillion ?? 0n);
  }

  return {
    priceVersion: AI_USAGE_PRICE_VERSION,
    pricingStatus: "priced",
    costNanoUsd: bigintToString(cost),
    reason: null,
  };
}

function perMillionCost(tokens, nanoUsdPerMillion) {
  if (!tokens || !nanoUsdPerMillion) return 0n;
  return (BigInt(Math.max(0, Math.trunc(tokens))) * BigInt(nanoUsdPerMillion)) / UNITS_PER_MILLION;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function numberOrZero(value) {
  const n = numberOrNull(value);
  return n == null ? 0 : n;
}
