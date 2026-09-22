import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  assertReplayPayloadSize,
  assertReplayRequestHashMatches,
  classifyExistingRouteRequest,
  filterReplayHeaders,
  hashReplayRequestPayload,
  replayExpiryFrom,
  responseFromReplayRow,
  routeReplayStudentId,
} from "@/app/lib/aiUsageRouteReplayCore.mjs";

const DEFAULT_STALE_MS = 2 * 60 * 1000;
const STRICT_OWNERSHIP_LOCK = "9999-12-31T23:59:59.000Z";

export class ReplayAiRouteResponse extends Error {
  constructor(response) {
    super("Replay completed AI route response.");
    this.response = response;
  }
}

export class AiRouteInProgressError extends Error {
  constructor(requestId, feature) {
    super("AI request is already being processed.");
    this.requestId = requestId;
    this.feature = feature;
  }
}

export class AiRouteRequestHashMismatchError extends Error {
  constructor(requestId, feature) {
    super("Idempotency key reused with different request payload.");
    this.requestId = requestId;
    this.feature = feature;
  }
}

export class AiRouteOwnershipUnavailableError extends Error {
  constructor() { super("AI request ownership is temporarily unavailable."); }
}

export class AiRouteNotReplayableError extends Error {
  constructor() { super("Completed AI response cannot be replayed."); }
}

export function aiRouteOwnershipUnavailableResponse() {
  return NextResponse.json(
    { ok: false, error: "AI request temporarily unavailable. Please retry later." },
    { status: 503, headers: { "Retry-After": "5" } }
  );
}

export function aiRouteNotReplayableResponse() {
  return NextResponse.json(
    { ok: false, error: "AI request already completed; response cannot be replayed." },
    { status: 409 }
  );
}

export function aiRouteInProgressResponse(error) {
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

export function aiRouteRequestHashMismatchResponse(error) {
  return NextResponse.json(
    {
      ok: false,
      error: "Idempotency key reused with different request payload.",
      requestId: error.requestId,
      feature: error.feature,
    },
    { status: 409 }
  );
}

export { classifyExistingRouteRequest, responseFromReplayRow, routeReplayStudentId };

export async function beginAiRouteRequest(args) {
  const strictOwnership = args.strictOwnership === true;
  const requestId = String(args.requestId || "").trim();
  const feature = String(args.feature || "").trim();
  const studentId = routeReplayStudentId({
    studentId: args.studentId,
    mobile: args.studentMobile,
  });
  const staleMs = Number.isFinite(args.staleMs) ? args.staleMs : DEFAULT_STALE_MS;
  const requestHash = args.requestHash || hashReplayRequestPayload(args.requestPayload || {});
  const now = new Date();
  const lockedUntil = strictOwnership ? STRICT_OWNERSHIP_LOCK : new Date(now.getTime() + staleMs).toISOString();

  if (!requestId || !feature) {
    if (strictOwnership) throw new AiRouteOwnershipUnavailableError();
    return { id: null, requestId, attempt: 0, replayEnabled: false };
  }

  try {
    const db = supabaseAdmin();
    const row = {
      student_id: studentId,
      feature,
      request_id: requestId,
      request_hash: requestHash,
      status: "in_progress",
      attempt_count: 0,
      locked_until: lockedUntil,
      started_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    const inserted = await db
      .from("ai_usage_requests")
      .insert(row)
      .select("*")
      .single();

    if (!inserted.error) {
      if (strictOwnership && !inserted.data?.id) throw new AiRouteOwnershipUnavailableError();
      return {
        id: inserted.data?.id || null,
        requestId,
        attempt: 0,
        replayEnabled: Boolean(inserted.data?.id),
        strictOwnership,
      };
    }

    if (inserted.error?.code !== "23505") {
      console.error("ai route replay begin failed");
      if (strictOwnership) throw new AiRouteOwnershipUnavailableError();
      return { id: null, requestId, attempt: 0, replayEnabled: false };
    }

    const existing = await db
      .from("ai_usage_requests")
      .select("*")
      .eq("student_id", studentId)
      .eq("feature", feature)
      .eq("request_id", requestId)
      .maybeSingle();

    if (existing.error || !existing.data) {
      console.error("ai route replay lookup failed");
      if (strictOwnership) throw new AiRouteOwnershipUnavailableError();
      return { id: null, requestId, attempt: 0, replayEnabled: false };
    }

    try {
      assertReplayRequestHashMatches(existing.data, requestHash);
    } catch (error) {
      if (error?.code === "REQUEST_HASH_MISMATCH") {
        throw new AiRouteRequestHashMismatchError(requestId, feature);
      }
      throw error;
    }
    const decision = classifyExistingRouteRequest(existing.data, now.getTime());

    if (decision.action === "replay") {
      throw new ReplayAiRouteResponse(responseFromReplayRow(existing.data));
    }

    if (strictOwnership && existing.data.status === "success") {
      throw new AiRouteNotReplayableError();
    }

    if (strictOwnership && decision.action === "reclaim") {
      throw new AiRouteInProgressError(requestId, feature);
    }

    if (decision.action === "in_progress") {
      throw new AiRouteInProgressError(requestId, feature);
    }

    const nextAttempt = decision.attempt;
    const reclaimed = await db
      .from("ai_usage_requests")
      .update({
        status: "in_progress",
        attempt_count: nextAttempt,
        locked_until: lockedUntil,
        last_error: null,
        response_status: null,
        response_headers: {},
        response_body_base64: null,
        response_body_sha256: null,
        replay_expires_at: null,
        completed_at: null,
        updated_at: now.toISOString(),
      })
      .eq("id", existing.data.id)
      .in(
        "status",
        decision.action === "retry"
          ? ["failure"]
          : decision.action === "expired"
          ? ["success", "in_progress"]
          : ["in_progress"]
      )
      .select("*")
      .single();

    if (reclaimed.error || !reclaimed.data) {
      throw new AiRouteInProgressError(requestId, feature);
    }

    return {
      id: reclaimed.data.id,
      requestId,
      attempt: nextAttempt,
      replayEnabled: true,
      strictOwnership,
    };
  } catch (error) {
    if (
      error instanceof ReplayAiRouteResponse ||
      error instanceof AiRouteInProgressError ||
      error instanceof AiRouteRequestHashMismatchError ||
      error instanceof AiRouteOwnershipUnavailableError ||
      error instanceof AiRouteNotReplayableError
    ) {
      throw error;
    }
    console.error("ai route replay begin failed");
    if (strictOwnership) throw new AiRouteOwnershipUnavailableError();
    return { id: null, requestId, attempt: 0, replayEnabled: false };
  }
}

export async function completeAiRouteRequest(reservation, response) {
  if (!reservation?.id) return response;

  const cloned = response.clone();
  const bytes = Buffer.from(await cloned.arrayBuffer());
  const headers = filterReplayHeaders(cloned.headers);
  headers["content-length"] = String(bytes.length);
  let storeBody = true;
  try {
    assertReplayPayloadSize(bytes.length, headers);
  } catch (error) {
    if (error?.code !== "REPLAY_PAYLOAD_TOO_LARGE") throw error;
    storeBody = false;
    console.warn("ai route replay payload too large; completed response is not replayable");
  }

  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("ai_usage_requests")
      .update({
        status: "success",
        response_status: cloned.status,
        response_headers: headers,
        response_body_base64: storeBody ? bytes.toString("base64") : null,
        response_body_sha256: storeBody ? createHash("sha256").update(bytes).digest("hex") : null,
        replay_expires_at: storeBody ? replayExpiryFrom() : null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", reservation.id)
      .eq("status", "in_progress")
      .select("id")
      .single();
    if (reservation.strictOwnership && (error || !data?.id)) throw new AiRouteOwnershipUnavailableError();
    if (error) console.error("ai route replay complete failed");
  } catch {
    console.error("ai route replay complete failed");
    if (reservation.strictOwnership) throw new AiRouteOwnershipUnavailableError();
  }

  return response;
}

export async function failAiRouteRequest(reservation, error) {
  if (!reservation?.id) return;
  try {
    const db = supabaseAdmin();
    await db
      .from("ai_usage_requests")
      .update({
        status: "failure",
        last_error: String(error?.message || error || "unknown").slice(0, 1000),
        locked_until: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", reservation.id);
  } catch {
    console.error("ai route replay failure mark failed");
  }
}
