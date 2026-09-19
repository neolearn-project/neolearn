/** @param {unknown} value */
function timestamp(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const normalized =
    typeof value === "string" && !value.includes("T")
      ? value.trim().replace(" ", "T")
      : value;
  return new Date(/** @type {string | number | Date} */ (normalized)).getTime();
}

/**
 * @param {{ is_active?: unknown, payment_status?: unknown, start_at?: unknown, end_at?: unknown } | null | undefined} subscription
 * @param {string | number | Date} [now]
 */
export function isPaidSubscriptionActive(subscription, now = Date.now()) {
  if (!subscription) return false;

  const nowMs = timestamp(now);
  const startMs = timestamp(subscription.start_at);
  const endMs = timestamp(subscription.end_at);
  const activeFlag =
    subscription.is_active === true || String(subscription.is_active) === "true";
  const paid = String(subscription.payment_status || "").toLowerCase() === "paid";

  return (
    activeFlag &&
    paid &&
    Number.isFinite(nowMs) &&
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    startMs <= nowMs &&
    endMs > nowMs
  );
}
