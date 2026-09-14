import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAiUsageIdempotencyKey,
  calculateOpenAICost,
  clientReportedRealtimeUsagePolicy,
  extractOpenAIUsage,
  realtimeSessionSetupUsagePolicy,
} from "../app/lib/aiUsagePricing.mjs";

test("prices text usage with cached and reasoning tokens", () => {
  const usage = extractOpenAIUsage({
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      output_tokens_details: { reasoning_tokens: 50 },
      input_tokens_details: { cached_tokens: 400 },
    },
  });

  assert.equal(usage.cachedInputTokens, 400);
  assert.equal(usage.reasoningTokens, 50);

  const priced = calculateOpenAICost("gpt-5-mini", usage);
  assert.equal(priced.pricingStatus, "priced");
  assert.equal(priced.costNanoUsd, "560000");
});

test("does not treat missing usage as zero", () => {
  const priced = calculateOpenAICost("gpt-5-mini", null);
  assert.equal(priced.pricingStatus, "unknown");
  assert.equal(priced.costNanoUsd, null);
  assert.equal(priced.reason, "missing_usage");
});

test("marks unknown model as unpriced", () => {
  const priced = calculateOpenAICost("some-new-model", {
    inputTokens: 100,
    outputTokens: 100,
  });
  assert.equal(priced.pricingStatus, "unpriced");
  assert.equal(priced.costNanoUsd, null);
});

test("prices embeddings from prompt token usage", () => {
  const usage = extractOpenAIUsage({ usage: { prompt_tokens: 1000, total_tokens: 1000 } });
  const priced = calculateOpenAICost("text-embedding-3-small", usage);
  assert.equal(priced.pricingStatus, "priced");
  assert.equal(priced.costNanoUsd, "20000");
});

test("keeps tts character proxy unpriced when token usage is unavailable", () => {
  const priced = calculateOpenAICost("gpt-4o-mini-tts", {
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    totalTokens: null,
    audioInputTokens: 0,
    cachedAudioInputTokens: 0,
    audioOutputTokens: 0,
    ttsCharacters: 1200,
  });
  assert.equal(priced.pricingStatus, "unknown");
  assert.equal(priced.reason, "tts_proxy_characters_only");
});

test("prices realtime text and audio tokens separately", () => {
  const priced = calculateOpenAICost("gpt-realtime-mini", {
    inputTokens: 1000,
    cachedInputTokens: 500,
    outputTokens: 1000,
    reasoningTokens: 0,
    totalTokens: 2000,
    audioInputTokens: 1000,
    cachedAudioInputTokens: 200,
    audioOutputTokens: 1000,
  });
  assert.equal(priced.pricingStatus, "priced");
  assert.equal(priced.costNanoUsd, "30790000");
});

test("builds stable duplicate request idempotency keys", () => {
  const first = buildAiUsageIdempotencyKey({
    requestId: "req_123",
    feature: "topic_tests",
    providerCall: "responses.create",
    retryAttempt: 0,
  });
  const duplicate = buildAiUsageIdempotencyKey({
    requestId: "req_123",
    feature: "topic_tests",
    providerCall: "responses.create",
    retryAttempt: 0,
  });
  const retry = buildAiUsageIdempotencyKey({
    requestId: "req_123",
    feature: "topic_tests",
    providerCall: "responses.create",
    retryAttempt: 1,
  });

  assert.equal(first, duplicate);
  assert.notEqual(first, retry);
});

test("marks realtime browser usage client-reported and non-authoritative", () => {
  const policy = clientReportedRealtimeUsagePolicy();
  assert.equal(policy.metadata.client_reported, true);
  assert.equal(policy.metadata.usage_source, "client_reported");
  assert.equal(policy.authoritativeBilling, false);
  assert.equal(policy.pricingStatusOverride, "unknown");
  assert.equal(policy.pricingReasonOverride, "client_reported_not_authoritative");
});

test("marks realtime client secret setup as non-authoritative session setup", () => {
  const policy = realtimeSessionSetupUsagePolicy();
  assert.equal(policy.metadata.client_reported, false);
  assert.equal(policy.metadata.usage_source, "session_setup");
  assert.equal(policy.authoritativeBilling, false);
  assert.equal(policy.pricingStatusOverride, "unknown");
  assert.equal(policy.pricingReasonOverride, null);
});
