import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { clearStudentSessionIfCurrent, createStudentSessionRefreshDeduper, currentStudentSessionKey, fetchStudentSessionRefresh, refreshStoredStudentSession } from "../app/lib/studentSessionRefresh.mjs";

function memoryStorage(value) {
  const values = new Map([["neolearnStudent", JSON.stringify(value)]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, next) => values.set(key, next),
    removeItem: (key) => values.delete(key),
    value: () => values.has("neolearnStudent") ? JSON.parse(values.get("neolearnStudent")) : null,
    raw: () => values.get("neolearnStudent"),
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("an expired access token refreshes on resume without replacing student state", async () => {
  const storage = memoryStorage({
    studentId: "student-1", mobile: "9999999999", classId: "6",
    access_token: "expired-access", refresh_token: "valid-refresh", expires_at: 100,
  });
  let calls = 0;
  const result = await refreshStoredStudentSession({
    storage, nowSeconds: 200,
    refresh: async (token) => {
      calls += 1;
      assert.equal(token, "valid-refresh");
      return { session: { access_token: "fresh-access", refresh_token: "rotated-refresh", expires_at: 500 }, error: null };
    },
  });
  assert.deepEqual(result, { status: "refreshed" });
  assert.equal(calls, 1);
  assert.deepEqual(storage.value(), {
    studentId: "student-1", mobile: "9999999999", classId: "6",
    access_token: "fresh-access", refresh_token: "rotated-refresh", expires_at: 500,
  });
});

test("temporary refresh failure preserves the stored session for a later retry", async () => {
  const storage = memoryStorage({ access_token: "expired", refresh_token: "refresh", expires_at: 100 });
  const before = storage.raw();
  const result = await refreshStoredStudentSession({ storage, nowSeconds: 200, refresh: async () => { throw new TypeError("offline"); } });
  assert.deepEqual(result, { status: "temporary_failure", reason: "refresh_unavailable" });
  assert.equal(storage.raw(), before);
});

test("confirmed refresh rejection is distinct from a network failure and does not extend expiry", async () => {
  const storage = memoryStorage({ access_token: "expired", refresh_token: "revoked", expires_at: 100 });
  const before = storage.raw();
  const result = await refreshStoredStudentSession({
    storage, nowSeconds: 200,
    refresh: async () => ({ session: null, error: { status: 401, message: "invalid refresh token" } }),
  });
  assert.equal(result.status, "unauthenticated");
  assert.equal(result.reason, "refresh_rejected");
  assert.equal(typeof result.sessionKey, "string");
  assert.equal(storage.raw(), before);
});

test("logout during refresh discards the stale successful result", async () => {
  const storage = memoryStorage({ studentId: "one", access_token: "old", refresh_token: "refresh", expires_at: 100 });
  const pending = deferred();
  const run = refreshStoredStudentSession({ storage, nowSeconds: 200, refresh: () => pending.promise });
  storage.removeItem("neolearnStudent");
  pending.resolve({ session: { access_token: "must-not-return", refresh_token: "must-not-return", expires_at: 500 } });
  assert.deepEqual(await run, { status: "stale" });
  assert.equal(storage.raw(), undefined);
});

test("account switching during successful or rejected refresh never overwrites or deletes the new account", async () => {
  for (const outcome of [
    { session: { access_token: "fresh-old", refresh_token: "rotated-old", expires_at: 500 } },
    { session: null, error: { status: 401 } },
  ]) {
    const storage = memoryStorage({ studentId: "old", access_token: "old-access", refresh_token: "old-refresh", expires_at: 100 });
    const pending = deferred();
    const run = refreshStoredStudentSession({ storage, nowSeconds: 200, refresh: () => pending.promise });
    const switched = { studentId: "new", access_token: "new-access", refresh_token: "new-refresh", expires_at: 600 };
    storage.setItem("neolearnStudent", JSON.stringify(switched));
    pending.resolve(outcome);
    assert.deepEqual(await run, { status: "stale" });
    assert.deepEqual(storage.value(), switched);
  }
});

test("newer same-account token rotation wins over an older refresh", async () => {
  const storage = memoryStorage({ studentId: "one", access_token: "old-access", refresh_token: "old-refresh", expires_at: 100 });
  const pending = deferred();
  const run = refreshStoredStudentSession({ storage, nowSeconds: 200, refresh: () => pending.promise });
  const newer = { studentId: "one", access_token: "newer-access", refresh_token: "newer-refresh", expires_at: 700 };
  storage.setItem("neolearnStudent", JSON.stringify(newer));
  pending.resolve({ session: { access_token: "stale-access", refresh_token: "stale-refresh", expires_at: 500 } });
  assert.deepEqual(await run, { status: "stale" });
  assert.deepEqual(storage.value(), newer);
});

test("confirmed cleanup removes only the session that was actually rejected", async () => {
  const storage = memoryStorage({ studentId: "old", access_token: "old-access", refresh_token: "old-refresh", expires_at: 100 });
  const key = currentStudentSessionKey(storage);
  assert.equal(clearStudentSessionIfCurrent(storage, key), true);
  assert.equal(storage.value(), null);
  storage.setItem("neolearnStudent", JSON.stringify({ studentId: "new", access_token: "new", refresh_token: "new-r", expires_at: 500 }));
  assert.equal(clearStudentSessionIfCurrent(storage, key), false);
  assert.equal(storage.value().studentId, "new");
});

test("same-session refreshes deduplicate while a different session proceeds independently", async () => {
  const deduper = createStudentSessionRefreshDeduper();
  const oldPending = deferred(); const newPending = deferred();
  let oldCalls = 0, newCalls = 0;
  const oldOne = deduper.run("old-session", () => { oldCalls += 1; return oldPending.promise; });
  const oldTwo = deduper.run("old-session", () => { oldCalls += 1; return Promise.resolve("wrong"); });
  const newOne = deduper.run("new-session", () => { newCalls += 1; return newPending.promise; });
  assert.equal(oldOne, oldTwo);
  assert.equal(oldCalls, 0); assert.equal(newCalls, 0);
  await Promise.resolve();
  assert.equal(oldCalls, 1); assert.equal(newCalls, 1);
  oldPending.resolve("old-done"); await oldOne;
  const newTwo = deduper.run("new-session", () => { newCalls += 1; return Promise.resolve("wrong"); });
  assert.equal(newOne, newTwo, "an older finally handler cannot clear the newer session's in-flight request");
  newPending.resolve("new-done"); await newOne;
});

test("timeout is temporary, preserves storage, clears its timer and permits retry", async () => {
  const storage = memoryStorage({ studentId: "one", access_token: "expired", refresh_token: "refresh", expires_at: 100 });
  const before = storage.raw(); let cleared = 0;
  const first = await refreshStoredStudentSession({
    storage, nowSeconds: 200,
    refresh: (refreshToken) => fetchStudentSessionRefresh({
      refreshToken, timeoutMs: 1,
      fetchImpl: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
      clearTimer: (timer) => { cleared += 1; clearTimeout(timer); },
    }),
  });
  assert.deepEqual(first, { status: "temporary_failure", reason: "refresh_unavailable" });
  assert.equal(storage.raw(), before); assert.equal(cleared, 1);
  const second = await refreshStoredStudentSession({ storage, nowSeconds: 200, refresh: async () => ({ session: { access_token: "fresh", refresh_token: "rotated", expires_at: 500 } }) });
  assert.deepEqual(second, { status: "refreshed" });
  assert.equal(storage.value().access_token, "fresh");
});

test("student resume handling refreshes auth only and never reloads or restarts classroom work", async () => {
  const page = await readFile(new URL("../app/student/page.tsx", import.meta.url), "utf8");
  const effect = page.slice(page.indexOf("const refreshOnResume"), page.indexOf("}, [router]);", page.indexOf("const refreshOnResume")));
  assert.match(effect, /visibilitychange/);
  assert.match(effect, /pageshow/);
  assert.match(effect, /focus/);
  assert.doesNotMatch(effect, /reload|handleStartLesson|generate-lesson|lesson-audio|setSelectedTopicId|setMessages/);
  assert.doesNotMatch(effect, /localStorage\.removeItem/);
});

test("server authentication distinguishes provider outages from rejected credentials", async () => {
  const ownership = await readFile(new URL("../lib/auth/ownership.ts", import.meta.url), "utf8");
  assert.match(ownership, /Unable to verify session right now\."?, 503/);
  assert.match(ownership, /status !== 400 && status !== 401 && status !== 403/);
  assert.match(ownership, /Invalid or expired session\."?, 401/);
});

test("student refresh delegates to the bounded helper without using the parent Supabase session", async () => {
  const clientAuth = await readFile(new URL("../app/lib/clientAuth.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/auth/student-refresh/route.ts", import.meta.url), "utf8");
  assert.match(clientAuth, /fetchStudentSessionRefresh\(\{ fetchImpl: fetch, refreshToken \}\)/);
  assert.doesNotMatch(clientAuth, /supabaseBrowser\.auth\.refreshSession/);
  assert.match(clientAuth, /supabaseBrowser\.auth\.getSession\(\)/, "parent session behavior remains intact");

  let request;
  const controller = new AbortController();
  const response = await fetchStudentSessionRefresh({
    refreshToken: "fixture-refresh-token",
    AbortControllerImpl: class { constructor() { return controller; } },
    setTimer: () => 17,
    clearTimer: (timer) => assert.equal(timer, 17),
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, status: 200, json: async () => ({ session: { access_token: "new-access" } }) };
    },
  });
  assert.equal(request.url, "/api/auth/student-refresh");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.signal, controller.signal);
  assert.equal(response.session.access_token, "new-access");
  assert.match(route, /Cache-Control": "no-store"/);
  assert.doesNotMatch(route, /console\.|refreshToken\s*[,}].*log/);
});
