const MAX_CONTEXT_CHARS = 12000;

function id(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function neutralizeSourceText(text = "") {
  return String(text).replace(/\0/g, "").trim();
}

export async function resolvePublishedTextbookContent(client, selection = {}) {
  const subjectId = id(selection.subjectId), chapterId = id(selection.chapterId), topicId = id(selection.topicId);
  if (!client || !subjectId || !chapterId || !topicId) return { state: "absent" };
  const { data: topic } = await client.from("topics").select("id,chapter_id,is_active").eq("id", topicId).eq("chapter_id", chapterId).eq("is_active", true).maybeSingle();
  const { data: chapter } = await client.from("chapters").select("id,subject_id").eq("id", chapterId).eq("subject_id", subjectId).maybeSingle();
  if (!topic || !chapter) return { state: "absent" };
  const { data: mappings, error: mappingError } = await client.from("textbook_topic_mappings")
    .select("page_from,page_to,source:textbook_sources!inner(id,version,sha256,status,published_at,unpublished_at,book_name,edition)")
    .eq("topic_id", topicId).eq("subject_id", subjectId).eq("chapter_id", chapterId)
    .order("published_at", { referencedTable:"textbook_sources", ascending:false, nullsFirst:false }).limit(20);
  if (mappingError) throw Object.assign(new Error(mappingError.message || "Textbook lookup failed"), { code: mappingError.code });
  if (!mappings?.length) return { state: "absent" };
  const candidates = mappings.map((mapping) => ({ mapping, source: Array.isArray(mapping.source) ? mapping.source[0] : mapping.source }))
    .filter((entry) => entry.source?.status === "published")
    .sort((a, b) => String(b.source.published_at || "").localeCompare(String(a.source.published_at || "")));
  if (!candidates.length) {
    const withdrawn = mappings.map((mapping) => Array.isArray(mapping.source) ? mapping.source[0] : mapping.source)
      .filter((source) => source?.published_at)
      .sort((a,b) => String(b.unpublished_at || "").localeCompare(String(a.unpublished_at || "")))[0];
    return withdrawn ? { state: "withdrawn", reason: "textbook_withdrawn",
      replayIdentity:`textbook-withdrawn:${withdrawn.id}:v${withdrawn.version}:${withdrawn.sha256}:${withdrawn.unpublished_at || "withdrawn"}` } : { state: "absent" };
  }
  const { mapping, source } = candidates[0];
  const { data: pages, error: pagesError } = await client.from("textbook_pages").select("page_number,extracted_text,reviewed_text,review_status")
    .eq("source_id", source.id).gte("page_number", mapping.page_from).lte("page_number", mapping.page_to).order("page_number");
  if (pagesError) throw Object.assign(new Error(pagesError.message || "Textbook pages lookup failed"), { code: pagesError.code });
  const expectedCount = mapping.page_to - mapping.page_from + 1;
  const pageBlocks = (pages || []).map((p) => ({ pageNumber:p.page_number, text:neutralizeSourceText(p.reviewed_text || p.extracted_text || ""), status:p.review_status }));
  const content = pageBlocks.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join("\n\n");
  const incomplete = pageBlocks.length !== expectedCount || pageBlocks.some((p) => p.status !== "approved" || !p.text) || content.length > MAX_CONTEXT_CHARS;
  const base = { sourceId: source.id, version: source.version, sha256: source.sha256, publishedAt: source.published_at,
    replayIdentity: `textbook:${source.id}:v${source.version}:${source.sha256}`, bookName: source.book_name, edition: source.edition };
  if (incomplete) return { ...base, state:"incomplete", reason:"textbook_coverage_incomplete", pageFrom:mapping.page_from, pageTo:mapping.page_to,
    availablePages:pageBlocks.map((p)=>p.pageNumber), characterCount:content.length, maxCharacters:MAX_CONTEXT_CHARS };
  return { ...base, state:"published", content };
}
