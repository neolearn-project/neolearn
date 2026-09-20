import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createAiCreditShadowRuntime } from "@/app/lib/aiCreditShadowRuntime.mjs";
import {
  AI_USAGE_PRICE_VERSION,
  buildAiUsageIdempotencyKey,
  calculateOpenAICost,
  extractOpenAIResponseId,
  extractOpenAIUsage,
} from "@/app/lib/aiUsagePricing.mjs";

type UsageMetrics = {
  inputTokens: number | null;
  cachedInputTokens: number;
  outputTokens: number | null;
  reasoningTokens: number;
  totalTokens: number | null;
  audioInputTokens: number;
  cachedAudioInputTokens: number;
  audioOutputTokens: number;
  ttsCharacters?: number | null;
};

type BeginArgs = {
  req: Request;
  studentId?: string | null;
  studentMobile?: string | null;
  feature: string;
  model: string;
  providerCall: string;
  requestId?: string | null;
  retryAttempt?: number;
  metadata?: Record<string, unknown>;
  authoritativeBilling?: boolean;
};

const shadowCredits = createAiCreditShadowRuntime({ supabaseAdmin });

export class DuplicateAiRequestError extends Error {
  constructor(public requestId: string, public feature: string) {
    super("Duplicate AI request idempotency key.");
  }
}

export function duplicateAiRequestResponse(error: DuplicateAiRequestError) {
  return NextResponse.json(
    {
      ok: false,
      error: "Duplicate AI request is already being processed.",
      requestId: error.requestId,
      feature: error.feature,
    },
    { status: 409 }
  );
}

export function resolveAiRequestId(req: Request, body?: any, fallbackPrefix = "ai") {
  return (
    req.headers.get("x-neolearn-request-id") ||
    req.headers.get("x-idempotency-key") ||
    req.headers.get("idempotency-key") ||
    body?.requestId ||
    body?.idempotencyKey ||
    `${fallbackPrefix}_${randomUUID()}`
  );
}

export function ledgerStudentId(args: { studentId?: string | null; mobile?: string | null }) {
  if (args.studentId) return String(args.studentId).trim();
  const mobile = String(args.mobile || "").trim();
  if (!mobile) return "unknown";
  return `mobile_sha256:${createHash("sha256").update(mobile).digest("hex")}`;
}

export async function beginAiUsageLedger(args: BeginArgs) {
  const requestId = args.requestId || resolveAiRequestId(args.req);
  const retryAttempt = Number.isFinite(args.retryAttempt) ? Number(args.retryAttempt) : 0;
  const idempotencyKey = buildAiUsageIdempotencyKey({
    requestId,
    feature: args.feature,
    providerCall: args.providerCall,
    retryAttempt,
  });

  const now = new Date().toISOString();
  const row = {
    student_id: ledgerStudentId({
      studentId: args.studentId,
      mobile: args.studentMobile,
    }),
    feature: args.feature,
    provider: "openai",
    provider_call: args.providerCall,
    model: args.model,
    request_id: requestId,
    idempotency_key: idempotencyKey,
    retry_attempt: retryAttempt,
    status: "in_progress",
    pricing_status: "unknown",
    price_version: AI_USAGE_PRICE_VERSION,
    metadata: {
      ...(args.metadata || {}),
      authoritative_billing: args.authoritativeBilling !== false,
    },
    created_at: now,
    started_at: now,
  };

  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("ai_usage_ledger")
      .insert(row)
      .select("id,request_id,feature")
      .single();

    if (error) {
      if ((error as any).code === "23505") {
        throw new DuplicateAiRequestError(requestId, args.feature);
      }
      console.error("ai usage ledger begin failed");
      return { id: null as string | null, requestId, idempotencyKey, shadowReservationId: null };
    }

    const ledgerId = data?.id as string;
    const shadowReservation = ledgerId ? await shadowCredits.reserve(ledgerId) : null;
    return {
      id: ledgerId,
      requestId,
      idempotencyKey,
      shadowReservationId: shadowReservation?.id || null,
    };
  } catch (error) {
    if (error instanceof DuplicateAiRequestError) throw error;
    console.error("ai usage ledger begin failed");
    return { id: null as string | null, requestId, idempotencyKey, shadowReservationId: null };
  }
}

export async function finishAiUsageLedger(args: {
  ledgerId: string | null;
  shadowReservationId?: string | null;
  model: string;
  response?: any;
  usage?: UsageMetrics | null;
  success: boolean;
  error?: unknown;
  pricingStatusOverride?: "priced" | "unpriced" | "unknown";
  pricingReasonOverride?: string | null;
}) {
  if (!args.ledgerId) return;

  const extractedUsage = (args.usage || extractOpenAIUsage(args.response)) as UsageMetrics | null;
  const cost = calculateOpenAICost(args.model, extractedUsage);
  const pricingStatus = args.pricingStatusOverride || cost.pricingStatus;
  const errorMessage = args.error
    ? String((args.error as any)?.message || args.error).slice(0, 1000)
    : null;

  const payload = {
    openai_response_id: extractOpenAIResponseId(args.response),
    input_tokens: extractedUsage?.inputTokens ?? null,
    cached_input_tokens: extractedUsage?.cachedInputTokens ?? null,
    output_tokens: extractedUsage?.outputTokens ?? null,
    reasoning_tokens: extractedUsage?.reasoningTokens ?? null,
    total_tokens: extractedUsage?.totalTokens ?? null,
    audio_input_tokens: extractedUsage?.audioInputTokens ?? null,
    cached_audio_input_tokens: extractedUsage?.cachedAudioInputTokens ?? null,
    audio_output_tokens: extractedUsage?.audioOutputTokens ?? null,
    tts_characters: extractedUsage?.ttsCharacters ?? null,
    cost_nano_usd: args.pricingStatusOverride ? null : cost.costNanoUsd,
    pricing_status: pricingStatus,
    pricing_reason: args.pricingReasonOverride === undefined ? cost.reason : args.pricingReasonOverride,
    price_version: cost.priceVersion,
    status: args.success ? "success" : "failure",
    error_message: errorMessage,
    completed_at: new Date().toISOString(),
  };

  try {
    const db = supabaseAdmin();
    const { error } = await db
      .from("ai_usage_ledger")
      .update(payload)
      .eq("id", args.ledgerId);
    if (error) {
      console.error("ai usage ledger finish failed");
      // Preserve the provider response and reservation on completion failure;
      // reconciliation remains dormant until a separately reviewed stale-orphan process exists.
      return;
    }
  } catch (error) {
    console.error("ai usage ledger finish failed");
    // Preserve the provider response and reservation on completion failure;
    // reconciliation remains dormant until a separately reviewed stale-orphan process exists.
    return;
  }

  if (args.shadowReservationId) {
    if (args.success) {
      await shadowCredits.settle(args.shadowReservationId);
    } else {
      await shadowCredits.release(args.shadowReservationId, "provider_failed");
    }
  }
}

export async function recordOpenAIUsage<T>(args: BeginArgs & {
  call: () => Promise<T>;
  usage?: (response: T) => UsageMetrics | null;
  success?: (response: T) => boolean;
  pricingStatusOverride?: "priced" | "unpriced" | "unknown";
  pricingReasonOverride?: string | null;
}) {
  const ledger = await beginAiUsageLedger(args);
  try {
    const response = await args.call();
    const success = args.success ? args.success(response) : true;
    await finishAiUsageLedger({
      ledgerId: ledger.id,
      shadowReservationId: ledger.shadowReservationId,
      model: args.model,
      response,
      usage: args.usage?.(response) || null,
      success,
      pricingStatusOverride: args.pricingStatusOverride,
      pricingReasonOverride: args.pricingReasonOverride,
    });
    return response;
  } catch (error) {
    await finishAiUsageLedger({
      ledgerId: ledger.id,
      shadowReservationId: ledger.shadowReservationId,
      model: args.model,
      response: null,
      usage: null,
      success: false,
      error,
    });
    throw error;
  }
}
