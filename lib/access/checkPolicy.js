export function computeAccessSummary(
  rows: any[],
  limit = 5,
  override?: { is_active?: boolean; expires_at?: string | null } | null
) {
  const uniqueTopicIds = new Set(
    (rows || []).map((row) => row?.topic_id).filter(Boolean)
  );

  const used = uniqueTopicIds.size;

  const now = Date.now();
  const overrideActive =
    !!override?.is_active &&
    (!override?.expires_at || new Date(override.expires_at).getTime() > now);

  return {
    used,
    limit,
    allowed: overrideActive ? true : used < limit,
    overrideActive,
  };
}