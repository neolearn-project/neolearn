export function normalizeHeading(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/^\s*(?:chapter|unit|lesson)\s+[\divxlcdm]+\s*[:.\-–—]?\s*/iu, "")
    .replace(/^\s*[\divxlcdm]+(?:\s*[.):-])\s*/iu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function headingEvidence(text, title) {
  const target = normalizeHeading(title);
  if (!target || target.length < 3) return null;
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const pageLabel = lines.slice(0, 8).map(normalizeHeading);
  if (pageLabel.some(line => /^(?:table of )?contents?$/.test(line) || /^index$/.test(line))) return null;
  for (const line of lines) {
    if (line.length > 180 || normalizeHeading(line) !== target) continue;
    const exact = line.toLocaleLowerCase("en").replace(/\s+/g, " ").trim() === String(title).toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
    return { evidence: line, matchKind: exact ? "exact" : "normalized" };
  }
  return null;
}

function uniqueHeadingMatches(pages, entries, nameKey) {
  const duplicateNames = new Set();
  const counts = new Map();
  for (const entry of entries) counts.set(normalizeHeading(entry[nameKey]), (counts.get(normalizeHeading(entry[nameKey])) || 0) + 1);
  for (const [name, count] of counts) if (name && count > 1) duplicateNames.add(name);

  const matches = new Map();
  for (const entry of entries) {
    const normalized = normalizeHeading(entry[nameKey]);
    if (!normalized || duplicateNames.has(normalized)) continue;
    const found = pages.flatMap(page => {
      const evidence = page.layoutPreserved ? headingEvidence(page.text, entry[nameKey]) : null;
      return evidence ? [{ pageNumber: page.pageNumber, ...evidence }] : [];
    });
    if (found.length === 1) matches.set(String(entry.id), found[0]);
  }
  return { matches, duplicateNames };
}

export function generateTextbookMappingSuggestions({ source, pages, subject }) {
  const cleanPages = (pages || []).map(page => ({ pageNumber: Number(page.pageNumber), text: String(page.text || ""), layoutPreserved: page.layoutPreserved === true }))
    .filter(page => Number.isInteger(page.pageNumber) && page.pageNumber > 0).sort((a, b) => a.pageNumber - b.pageNumber);
  const chapters = subject?.chapters || [];
  const topics = chapters.flatMap(chapter => (chapter.topics || []).filter(topic => topic.is_active !== false)
    .map(topic => ({ ...topic, chapterId: chapter.id, chapterName: chapter.chapter_name })));
  const chapterResult = uniqueHeadingMatches(cleanPages, chapters, "chapter_name");
  const topicResult = uniqueHeadingMatches(cleanPages, topics, "topic_name");
  const boundaries = [...chapterResult.matches.values(), ...topicResult.matches.values()].map(match => match.pageNumber);

  const suggestions = [];
  const unresolved = [];
  for (const topic of topics) {
    const normalized = normalizeHeading(topic.topic_name);
    if (topicResult.duplicateNames.has(normalized)) {
      unresolved.push({ chapterId: topic.chapterId, chapterName: topic.chapterName, topicId: topic.id, topicName: topic.topic_name, reason: "This heading is ambiguous because more than one existing topic has the same normalized title." });
      continue;
    }
    const match = topicResult.matches.get(String(topic.id));
    if (!match) {
      const chapterMatch = chapterResult.matches.get(String(topic.chapterId));
      unresolved.push({ chapterId: topic.chapterId, chapterName: topic.chapterName, topicId: topic.id, topicName: topic.topic_name,
        reason: chapterMatch ? `The chapter heading appears on PDF page ${chapterMatch.pageNumber}, but no distinct heading for this topic was found.` : "No unique, strong topic heading was found in the processed PDF pages." });
      continue;
    }
    const nextBoundary = boundaries.filter(pageNumber => pageNumber > match.pageNumber).sort((a, b) => a - b)[0];
    const pageTo = nextBoundary ? nextBoundary - 1 : match.pageNumber;
    suggestions.push({
      subjectId: subject.id, subjectName: subject.subject_name, chapterId: topic.chapterId, chapterName: topic.chapterName,
      topicId: topic.id, topicName: topic.topic_name, pageFrom: match.pageNumber, pageTo,
      matchingHeading: match.evidence, evidence: [{ pageNumber: match.pageNumber, text: match.evidence }], matchKind: match.matchKind,
      reason: nextBoundary
        ? `The ${match.matchKind} topic heading starts on PDF page ${match.pageNumber}; the next detected topic or chapter boundary starts on PDF page ${nextBoundary}.`
        : `The ${match.matchKind} topic heading appears on PDF page ${match.pageNumber}; without a later detected boundary, only that PDF page is proposed.`,
    });
  }
  return { sourceIdentity: { sourceId: source.id, version: Number(source.version), sha256: source.sha256, processingRevision: Number(source.processing_revision) }, suggestions, unresolved };
}

export function suggestionIdentityMatches(expected, source, latestVersion) {
  return Boolean(expected && source && expected.sourceId === source.id && Number(expected.version) === Number(source.version) &&
    typeof expected.sha256 === "string" && expected.sha256 === source.sha256 && Number(expected.processingRevision) === Number(source.processing_revision) &&
    Number(latestVersion) === Number(source.version));
}

export function mergeAcceptedSuggestions(existingMappings, suggestions) {
  const accepted = (suggestions || []).filter(item => item.selected !== false).map(item => ({
    subjectId: String(item.subjectId), chapterId: String(item.chapterId), topicId: String(item.topicId),
    pageFrom: String(item.pageFrom), pageTo: String(item.pageTo),
  }));
  const acceptedIds = new Set(accepted.map(item => item.topicId));
  return [...(existingMappings || []).filter(item => !acceptedIds.has(String(item.topicId))), ...accepted];
}
