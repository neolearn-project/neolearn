const HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate", Pragma: "no-cache", Expires: "0" };
const CATEGORIES = ["terminal_reserved_backlog", "stale_in_progress", "identity_mismatch_or_orphan", "settlement_conflict", "excluded_usage", "policy_or_tranche_coverage", "expired_period", "expired_tranche"];
const EXCLUSIONS = ["unknown_pricing", "unpriced", "non_authoritative", "non_billable_client_reported", "non_billable_excluded", "non_terminal_or_failed"];
const USAGE = ["active_entitlement_periods", "term_consumed", "rolling_5h_consumed", "rolling_24h_consumed", "term_exceeded", "term_near_limit", "rolling_5h_exceeded", "rolling_5h_near_limit", "rolling_24h_exceeded", "rolling_24h_near_limit"];
const LATEST = ["latest_ledger_created_at", "latest_terminal_ledger_at", "latest_reservation_updated_at", "latest_transaction_at", "latest_entitlement_period_start", "latest_reconciliation_backlog_at"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
const integer = (value, name, min, max, fallback) => {
  if (value === null || value === "") return fallback;
  if (!/^[0-9]+$/.test(value)) throw new Error(name);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(name);
  return parsed;
};
const boolean = (value) => {
  if (value === null || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error("identifiers");
};
const count = (value) => {
  const text = String(value ?? "");
  if (!/^(0|[1-9][0-9]{0,29})$/.test(text)) throw new Error("count");
  return text;
};
const timestamp = (value) => value == null ? null :
  (typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : (() => { throw new Error("timestamp"); })());
const pickCounts = (source, keys) => Object.fromEntries(keys.map((key) => [key, count(source?.[key])]));

export function parseAdminMonitorQuery(url) {
  const query = new URL(url).searchParams;
  return {
    limit: integer(query.get("limit"), "limit", 1, 500, 100),
    staleMinutes: integer(query.get("staleMinutes"), "staleMinutes", 1, 43200, 60),
    nearLimitBps: integer(query.get("nearLimitBps"), "nearLimitBps", 1, 10000, 9000),
    includeIdentifiers: boolean(query.get("includeIdentifiers")),
  };
}

export function safeAdminMonitorReport(report, expected) {
  if (!report || report.observational_only !== true || report.enforcement_active !== false
      || report.identifiers_included !== expected.includeIdentifiers
      || Number(report.limit) !== expected.limit || Number(report.near_limit_bps) !== expected.nearLimitBps
      || Number(report.stale_after_seconds) !== expected.staleMinutes * 60) throw new Error("report contract");
  const findings = Array.isArray(report.findings) ? report.findings.map((finding) => {
    if (!CATEGORIES.includes(finding?.category)) throw new Error("category");
    const item = { category: finding.category, observedAt: timestamp(finding.observed_at) };
    if (expected.includeIdentifiers) {
      if (!UUID.test(String(finding.entity_id || ""))) throw new Error("identifier");
      item.entityId = finding.entity_id;
    }
    return item;
  }) : (() => { throw new Error("findings"); })();
  return {
    ok: true, observationalOnly: true, enforcementActive: false,
    evaluatedAt: timestamp(report.evaluated_at), limit: expected.limit,
    staleMinutes: expected.staleMinutes, nearLimitBps: expected.nearLimitBps,
    identifiersIncluded: expected.includeIdentifiers,
    categoryCounts: pickCounts(report.category_counts, CATEGORIES),
    exclusionCounts: pickCounts(report.exclusion_counts, EXCLUSIONS),
    shadowUsage: pickCounts(report.shadow_usage, USAGE),
    latestTimestamps: Object.fromEntries(LATEST.map((key) => [key, timestamp(report.latest_timestamps?.[key])])),
    findings,
  };
}

export function createAdminAiCreditMonitorHandler({ authorizeAdmin, getDatabase, now = () => new Date() }) {
  return async function GET(request) {
    try {
      if (!authorizeAdmin(request)) return json({ ok: false, error: "Unauthorized." }, 401);
      let options;
      try { options = parseAdminMonitorQuery(request.url); }
      catch { return json({ ok: false, error: "Invalid monitoring query." }, 400); }
      const database = getDatabase();
      const result = await database.rpc("read_ai_credit_operational_monitor", {
        p_evaluated_at: now().toISOString(), p_limit: options.limit,
        p_stale_after: `${options.staleMinutes} minutes`, p_near_limit_bps: options.nearLimitBps,
        p_include_identifiers: options.includeIdentifiers,
      });
      if (result.error || !result.data) return json({ ok: false, error: "AI credit monitoring is temporarily unavailable." }, 503);
      return json(safeAdminMonitorReport(result.data, options));
    } catch {
      return json({ ok: false, error: "AI credit monitoring is temporarily unavailable." }, 503);
    }
  };
}
