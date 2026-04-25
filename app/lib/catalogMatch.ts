export type CatalogRow = {
  id: number;
  subject_id: number | null;
  chapter_id: number | null;
  topic_id: number | null;
  board: string;
  class_number: number;
  subject_code: string | null;
  subject_name: string;
  book_name: string | null;
  chapter_number: number | null;
  chapter_name: string | null;
  topic_number: number | null;
  topic_name: string | null;
  content_type: "subject" | "chapter" | "topic";
  stream_type: string;
  chapter_type: string | null;
  source_ref: string | null;
  textbook_series: string | null;
  language: string;
  subject_aliases: string[] | null;
  book_aliases: string[] | null;
  chapter_aliases: string[] | null;
  topic_aliases: string[] | null;
  normalized_subject: string | null;
  normalized_book: string | null;
  normalized_chapter: string | null;
  normalized_topic: string | null;
  is_active: boolean;
};

export type CatalogMatch = {
  row: CatalogRow;
  score: number;
  matchType: string;
};

export function normalizeText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => normalizeText(String(v || "")))
    .filter(Boolean);
}

function scoreOne(row: CatalogRow, query: string): CatalogMatch | null {
  const q = normalizeText(query);
  if (!q) return null;

  const subject = row.normalized_subject || normalizeText(row.subject_name || "");
  const book = row.normalized_book || normalizeText(row.book_name || "");
  const chapter = row.normalized_chapter || normalizeText(row.chapter_name || "");
  const topic = row.normalized_topic || normalizeText(row.topic_name || "");

  const subjectAliases = normalizeList(row.subject_aliases);
  const bookAliases = normalizeList(row.book_aliases);
  const chapterAliases = normalizeList(row.chapter_aliases);
  const topicAliases = normalizeList(row.topic_aliases);

  if (topic && topic === q) return { row, score: 1.0, matchType: "topic_exact" };
  if (chapter && chapter === q) return { row, score: 0.98, matchType: "chapter_exact" };
  if (book && book === q) return { row, score: 0.95, matchType: "book_exact" };
  if (subject && subject === q) return { row, score: 0.92, matchType: "subject_exact" };

  if (topicAliases.includes(q)) return { row, score: 0.97, matchType: "topic_alias" };
  if (chapterAliases.includes(q)) return { row, score: 0.95, matchType: "chapter_alias" };
  if (bookAliases.includes(q)) return { row, score: 0.93, matchType: "book_alias" };
  if (subjectAliases.includes(q)) return { row, score: 0.90, matchType: "subject_alias" };

  if (topic && topic.includes(q)) return { row, score: 0.88, matchType: "topic_partial" };
  if (chapter && chapter.includes(q)) return { row, score: 0.84, matchType: "chapter_partial" };
  if (book && book.includes(q)) return { row, score: 0.80, matchType: "book_partial" };
  if (subject && subject.includes(q)) return { row, score: 0.76, matchType: "subject_partial" };

  return null;
}

export function matchCatalogRows(rows: CatalogRow[], query: string): CatalogMatch[] {
  return rows
    .map((row) => scoreOne(row, query))
    .filter((x): x is CatalogMatch => Boolean(x))
    .sort((a, b) => b.score - a.score);
}
