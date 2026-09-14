import { createHash } from "crypto";

export const REPLAY_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_JSON_REPLAY_BYTES = 1_000_000;
export const MAX_AUDIO_REPLAY_BYTES = 5_000_000;
export const REPLAY_HEADER_ALLOWLIST = new Set(["content-type", "cache-control"]);

export function routeReplayStudentId({ studentId, mobile }) {
  if (studentId) return String(studentId).trim();
  const normalized = String(mobile || "").trim();
  if (!normalized) return "unknown";
  return `mobile_sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}

export function hashReplayRequestPayload(payload) {
  return createHash("sha256")
    .update(stableStringify(sanitizeReplayPayload(payload)))
    .digest("hex");
}

export function assertReplayRequestHashMatches(existing, requestHash) {
  if (!existing?.request_hash || !requestHash || existing.request_hash === requestHash) return;
  const error = new Error("Idempotency key reused with different request payload.");
  error.code = "REQUEST_HASH_MISMATCH";
  throw error;
}

export function replayRowHasExpired(row, nowMs = Date.now()) {
  return Boolean(row?.replay_expires_at && new Date(row.replay_expires_at).getTime() <= nowMs);
}

export function classifyExistingRouteRequest(existing, nowMs = Date.now()) {
  if (replayRowHasExpired(existing, nowMs)) {
    return {
      action: existing.status === "failure" ? "retry" : "expired",
      attempt: Number(existing.attempt_count || 0) + 1,
    };
  }

  if (existing?.status === "success" && existing?.response_body_base64) {
    return { action: "replay", attempt: Number(existing.attempt_count || 0) };
  }

  const lockTime = existing?.locked_until ? new Date(existing.locked_until).getTime() : 0;
  if (existing?.status === "failure") {
    return { action: "retry", attempt: Number(existing.attempt_count || 0) + 1 };
  }
  if (existing?.status === "in_progress" && lockTime <= nowMs) {
    return { action: "reclaim", attempt: Number(existing.attempt_count || 0) + 1 };
  }
  return { action: "in_progress", attempt: Number(existing?.attempt_count || 0) };
}

export function responseFromReplayRow(row) {
  const body = Buffer.from(String(row.response_body_base64 || ""), "base64");
  const headers = new Headers(row.response_headers || {});
  return new Response(body, {
    status: Number(row.response_status || 200),
    headers,
  });
}

export function filterReplayHeaders(headers) {
  const safe = {};
  const entries =
    typeof headers?.forEach === "function"
      ? (() => {
          const values = [];
          headers.forEach((value, key) => values.push([key, value]));
          return values;
        })()
      : Object.entries(headers || {});

  for (const [key, value] of entries) {
    const lower = String(key).toLowerCase();
    if (REPLAY_HEADER_ALLOWLIST.has(lower)) {
      safe[lower] = String(value);
    }
  }
  return safe;
}

export function maxReplayBytesForHeaders(headers) {
  const contentType = String(headers?.["content-type"] || "").toLowerCase();
  if (contentType.startsWith("audio/")) return MAX_AUDIO_REPLAY_BYTES;
  return MAX_JSON_REPLAY_BYTES;
}

export function assertReplayPayloadSize(bytesLength, headers) {
  const max = maxReplayBytesForHeaders(headers);
  if (bytesLength <= max) return;
  const error = new Error(`Replay payload exceeds ${max} byte limit.`);
  error.code = "REPLAY_PAYLOAD_TOO_LARGE";
  throw error;
}

export function replayExpiryFrom(nowMs = Date.now()) {
  return new Date(nowMs + REPLAY_TTL_MS).toISOString();
}

function sanitizeReplayPayload(value) {
  if (Array.isArray(value)) return value.map(sanitizeReplayPayload);
  if (!value || typeof value !== "object") return value;

  const clean = {};
  for (const [key, child] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("authorization") ||
      lower.includes("cookie") ||
      lower.includes("token") ||
      lower.includes("secret")
    ) {
      continue;
    }
    clean[key] = sanitizeReplayPayload(child);
  }
  return clean;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}
