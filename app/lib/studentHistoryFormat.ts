export const HISTORY_LIST_LIMIT = 200;
export const HISTORY_INITIAL_VISIBLE = 30;
export const TRANSCRIPT_PREVIEW_LENGTH = 140;
export const TRANSCRIPT_DETAIL_CHUNK = 8000;
export const TRANSCRIPT_DETAIL_MAX = 32000;

export function safeHistoryText(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

export function safeHistoryDate(value: unknown) {
  const text = safeHistoryText(value);
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

export function formatHistoryDate(value: unknown) {
  const date = safeHistoryDate(value);
  return date ? date.toLocaleString() : "Date unavailable";
}

