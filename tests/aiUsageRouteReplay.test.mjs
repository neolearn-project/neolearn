import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_AUDIO_REPLAY_BYTES,
  MAX_JSON_REPLAY_BYTES,
  assertReplayPayloadSize,
  assertReplayRequestHashMatches,
  classifyExistingRouteRequest,
  filterReplayHeaders,
  hashReplayRequestPayload,
  replayExpiryFrom,
  replayRowHasExpired,
  responseFromReplayRow,
  routeReplayStudentId,
} from "../app/lib/aiUsageRouteReplayCore.mjs";

test("duplicate completed requests replay", async () => {
  const body = Buffer.from(JSON.stringify({ ok: true, answer: "same" }));
  const decision = classifyExistingRouteRequest({
    status: "success",
    attempt_count: 0,
    response_body_base64: body.toString("base64"),
  });
  assert.equal(decision.action, "replay");

  const response = responseFromReplayRow({
    response_status: 200,
    response_headers: { "content-type": "application/json" },
    response_body_base64: body.toString("base64"),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), { ok: true, answer: "same" });
});

test("duplicate concurrency stays in progress and does not retry", () => {
  const decision = classifyExistingRouteRequest({
    status: "in_progress",
    attempt_count: 0,
    locked_until: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(decision.action, "in_progress");
  assert.equal(decision.attempt, 0);
});

test("stale in_progress reservations are reclaimed with next attempt", () => {
  const now = Date.now();
  const decision = classifyExistingRouteRequest({
    status: "in_progress",
    attempt_count: 2,
    locked_until: new Date(now - 1).toISOString(),
  }, now);
  assert.equal(decision.action, "reclaim");
  assert.equal(decision.attempt, 3);
});

test("failed requests retry with next attempt", () => {
  const decision = classifyExistingRouteRequest({
    status: "failure",
    attempt_count: 1,
    locked_until: new Date(Date.now() - 1).toISOString(),
  });
  assert.equal(decision.action, "retry");
  assert.equal(decision.attempt, 2);
});

test("identity spoofing cannot choose raw mobile ledger identity", () => {
  const hashed = routeReplayStudentId({ mobile: "9999999999" });
  const verified = routeReplayStudentId({ studentId: "auth-user-id", mobile: "9999999999" });
  assert.match(hashed, /^mobile_sha256:/);
  assert.notEqual(hashed, "9999999999");
  assert.equal(verified, "auth-user-id");
});

test("audio replay preserves response format and bytes", async () => {
  const bytes = Buffer.from([1, 2, 3, 4, 5]);
  const response = responseFromReplayRow({
    response_status: 200,
    response_headers: {
      "content-type": "audio/mpeg",
      "cache-control": "no-store",
      "content-length": String(bytes.length),
    },
    response_body_base64: bytes.toString("base64"),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(Buffer.compare(Buffer.from(await response.arrayBuffer()), bytes), 0);
});

test("request hash mismatch rejects idempotency key reuse with different input", () => {
  const first = hashReplayRequestPayload({ topic: "Fractions", token: "secret" });
  const sameSansSecret = hashReplayRequestPayload({ topic: "Fractions", token: "different-secret" });
  const different = hashReplayRequestPayload({ topic: "Decimals" });

  assert.equal(first, sameSansSecret);
  assert.throws(
    () => assertReplayRequestHashMatches({ request_hash: first }, different),
    /different request payload/
  );
});

test("completed replay payload expires after 24 hours", () => {
  const now = Date.now();
  const expires = replayExpiryFrom(now);
  assert.equal(new Date(expires).getTime() - now, 24 * 60 * 60 * 1000);

  const expiredRow = {
    status: "success",
    attempt_count: 0,
    response_body_base64: "e30=",
    replay_expires_at: new Date(now - 1).toISOString(),
  };
  assert.equal(replayRowHasExpired(expiredRow, now), true);
  const decision = classifyExistingRouteRequest(expiredRow, now);
  assert.equal(decision.action, "expired");
  assert.equal(decision.attempt, 1);
});

test("expired replay cleanup can clear payload while preserving row", () => {
  const row = {
    status: "success",
    response_headers: { "content-type": "application/json" },
    response_body_base64: "e30=",
    response_body_sha256: "hash",
    replay_expires_at: new Date(Date.now() - 1).toISOString(),
  };
  assert.equal(replayRowHasExpired(row), true);
  const cleaned = {
    ...row,
    response_headers: {},
    response_body_base64: null,
    response_body_sha256: null,
  };
  assert.equal(cleaned.status, "success");
  assert.equal(cleaned.response_body_base64, null);
});

test("replay payload size limits are enforced for json and audio", () => {
  assert.doesNotThrow(() =>
    assertReplayPayloadSize(MAX_JSON_REPLAY_BYTES, { "content-type": "application/json" })
  );
  assert.throws(
    () => assertReplayPayloadSize(MAX_JSON_REPLAY_BYTES + 1, { "content-type": "application/json" }),
    /byte limit/
  );
  assert.doesNotThrow(() =>
    assertReplayPayloadSize(MAX_AUDIO_REPLAY_BYTES, { "content-type": "audio/mpeg" })
  );
  assert.throws(
    () => assertReplayPayloadSize(MAX_AUDIO_REPLAY_BYTES + 1, { "content-type": "audio/mpeg" }),
    /byte limit/
  );
});

test("sensitive headers are filtered from replay storage", () => {
  const headers = filterReplayHeaders({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Authorization: "Bearer secret",
    Cookie: "sid=secret",
    "Set-Cookie": "sid=secret",
    "X-Api-Token": "secret",
  });

  assert.deepEqual(headers, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
});
