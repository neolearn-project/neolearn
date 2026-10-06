export const STUDENT_SESSION_REFRESH_SKEW_SECONDS = 60;
export const STUDENT_SESSION_REFRESH_TIMEOUT_MS = 10000;
const STORAGE_KEY = "neolearnStudent";

function readStored(storage) {
  try { return JSON.parse(storage?.getItem(STORAGE_KEY) || "null"); }
  catch { return null; }
}

function snapshotKey(stored) {
  if (!stored || typeof stored !== "object") return "";
  return JSON.stringify([stored.studentId || stored.userId || "", stored.mobile || "", stored.username || "", stored.access_token || "", stored.refresh_token || ""]);
}

export function currentStudentSessionKey(storage) { return snapshotKey(readStored(storage)); }

export function clearStudentSessionIfCurrent(storage, expectedSessionKey) {
  if (!expectedSessionKey || currentStudentSessionKey(storage) !== expectedSessionKey) return false;
  storage.removeItem(STORAGE_KEY);
  return true;
}

function confirmedAuthFailure(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  return status === 400 || status === 401;
}

export function createStudentSessionRefreshDeduper() {
  const inFlight = new Map();
  return {
    run(sessionKey, task) {
      const existing = inFlight.get(sessionKey);
      if (existing) return existing;
      const request = Promise.resolve().then(task);
      const tracked = request.finally(() => {
        if (inFlight.get(sessionKey) === tracked) inFlight.delete(sessionKey);
      });
      inFlight.set(sessionKey, tracked);
      return tracked;
    },
  };
}

export async function fetchStudentSessionRefresh({ fetchImpl, refreshToken, timeoutMs = STUDENT_SESSION_REFRESH_TIMEOUT_MS, AbortControllerImpl = AbortController, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const controller = new AbortControllerImpl();
  const timer = setTimer(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl("/api/auth/student-refresh", {
      method: "POST", cache: "no-store", signal: controller.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }),
    });
    const data = await response.json().catch(() => null);
    return response.ok ? { session: data?.session, error: null } : { session: null, error: { status: response.status } };
  } finally { clearTimer(timer); }
}

export async function refreshStoredStudentSession({ storage, refresh, nowSeconds = Math.floor(Date.now() / 1000), skewSeconds = STUDENT_SESSION_REFRESH_SKEW_SECONDS }) {
  const stored = readStored(storage);
  if (!stored) return { status: "unauthenticated", reason: "invalid_storage" };
  if (!stored.access_token) return { status: "not_refreshable", reason: "missing_access_token" };
  const expiresAt = Number(stored.expires_at || 0);
  if (!expiresAt || expiresAt > nowSeconds + skewSeconds) return { status: "valid" };
  const refreshToken = String(stored.refresh_token || "").trim();
  const sessionKey = snapshotKey(stored);
  if (!refreshToken) return { status: "unauthenticated", reason: "missing_refresh_token", sessionKey };

  try {
    const result = await refresh(refreshToken);
    if (currentStudentSessionKey(storage) !== sessionKey) return { status: "stale" };
    if (result?.error || !result?.session?.access_token) {
      return confirmedAuthFailure(result?.error)
        ? { status: "unauthenticated", reason: "refresh_rejected", sessionKey }
        : { status: "temporary_failure", reason: "refresh_unavailable" };
    }
    const next = { ...stored, access_token: result.session.access_token, refresh_token: result.session.refresh_token || refreshToken, expires_at: result.session.expires_at ?? stored.expires_at };
    if (currentStudentSessionKey(storage) !== sessionKey) return { status: "stale" };
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return { status: "refreshed" };
  } catch (error) {
    if (currentStudentSessionKey(storage) !== sessionKey) return { status: "stale" };
    return confirmedAuthFailure(error)
      ? { status: "unauthenticated", reason: "refresh_rejected", sessionKey }
      : { status: "temporary_failure", reason: "refresh_unavailable" };
  }
}
