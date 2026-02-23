export function computeAccessSummary(rows, limit = 5) {
  const uniqueTopicIds = new Set(
    (rows || []).map((row) => row?.topic_id).filter(Boolean)
  );

  const used = uniqueTopicIds.size;

  return {
    used,
    limit,
    allowed: used < limit,
  };
}
