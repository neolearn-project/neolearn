const MATERIAL_KEYS = new Set([
  "passage", "text", "lesson", "lessonText", "teachingMaterial", "material",
  "summary", "explanation", "notes", "learningObjectives", "examples",
]);

function collectMaterial(value, key = "", output = []) {
  if (typeof value === "string") {
    if (!key || MATERIAL_KEYS.has(key)) output.push(value.trim());
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMaterial(item, key, output);
    return output;
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      if (MATERIAL_KEYS.has(childKey)) collectMaterial(child, childKey, output);
    }
  }
  return output;
}

export function extractSubstantiveCurriculumContent(value) {
  const text = collectMaterial(value).filter(Boolean).join("\n\n").trim();
  return text.length >= 160 ? text.slice(0, 20_000) : "";
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function numericId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function resolveCurriculumContent(client, selection = {}) {
  const subjectId = numericId(selection.subjectId);
  const chapterId = numericId(selection.chapterId);
  const topicId = numericId(selection.topicId);
  if (!client || !subjectId || !chapterId || !topicId) {
    return { matched: false, usable: false, reason: "invalid_selection", content: "", version: null };
  }

  const { data: topic, error: topicError } = await client
    .from("topics")
    .select("id, chapter_id, topic_name, content, is_active")
    .eq("id", topicId)
    .eq("chapter_id", chapterId)
    .eq("is_active", true)
    .maybeSingle();
  if (topicError || !topic) return { matched: false, usable: false, reason: "topic_not_found", content: "", version: null };

  const { data: chapter, error: chapterError } = await client
    .from("chapters")
    .select("id, subject_id, chapter_name")
    .eq("id", chapterId)
    .eq("subject_id", subjectId)
    .maybeSingle();
  if (chapterError || !chapter) return { matched: false, usable: false, reason: "chapter_not_found", content: "", version: null };

  const { data: subject, error: subjectError } = await client
    .from("subjects")
    .select("id, board, class_number, subject_name")
    .eq("id", subjectId)
    .maybeSingle();
  if (subjectError || !subject) return { matched: false, usable: false, reason: "subject_not_found", content: "", version: null };

  let textbook = null;
  try {
    textbook = await resolvePublishedTextbookContent(client, { subjectId, chapterId, topicId });
  } catch (error) {
    // Deployments can run application code before the optional migration is applied.
    // Legacy topics.content remains the safe fallback until the tables exist.
    if (!["42P01", "PGRST205"].includes(error?.code)) {
      return { matched: true, usable: false, reason: "content_lookup_unavailable", content: "", version: null,
        subject: String(subject.subject_name || ""), chapter: String(chapter.chapter_name || ""), topic: String(topic.topic_name || ""),
        board: String(subject.board || ""), classNumber: Number(subject.class_number), subjectId, chapterId, topicId };
    }
  }
  if (textbook?.state === "published") {
    return {
      matched: true, usable: true, reason: "published_textbook", content: textbook.content,
      version: textbook.replayIdentity, source: textbook,
      subject: String(subject.subject_name || ""), chapter: String(chapter.chapter_name || ""),
      topic: String(topic.topic_name || ""), board: String(subject.board || ""),
      classNumber: Number(subject.class_number), subjectId, chapterId, topicId,
    };
  }
  if (textbook?.state === "withdrawn" || textbook?.state === "incomplete") {
    return { matched: true, usable: false, reason: textbook.reason, content: "", version: textbook.replayIdentity || null, source: textbook,
      message: textbook.state === "withdrawn"
        ? "This textbook material has been withdrawn and is not available for teaching."
        : `The mapped textbook pages cannot fit safely in one teaching context or are incomplete. Narrow the page mapping or complete page review before teaching.`,
      subject: String(subject.subject_name || ""), chapter: String(chapter.chapter_name || ""), topic: String(topic.topic_name || ""),
      board: String(subject.board || ""), classNumber: Number(subject.class_number), subjectId, chapterId, topicId };
  }

  const content = extractSubstantiveCurriculumContent(topic.content);
  const identity = JSON.stringify({
    subjectId, chapterId, topicId,
    subject: subject.subject_name,
    chapter: chapter.chapter_name,
    topic: topic.topic_name,
    content,
  });
  return {
    matched: true,
    usable: Boolean(content),
    reason: content ? "available" : "labels_only",
    content,
    version: await sha256(identity),
    subject: String(subject.subject_name || ""),
    chapter: String(chapter.chapter_name || ""),
    topic: String(topic.topic_name || ""),
    board: String(subject.board || ""),
    classNumber: Number(subject.class_number),
    subjectId,
    chapterId,
    topicId,
  };
}

export const BUILT_IN_CONTENT_MISSING_MESSAGE =
  "This topic is listed in NeoLearn, but its full teaching material is not available yet. I won't invent missing textbook details. You can choose another available topic, or optionally upload the relevant page for help with this chapter.";
import { resolvePublishedTextbookContent } from "./textbookContent.mjs";
