const LITERATURE_SUBJECT = /\b(english|hindi|bengali|bangla|sanskrit|literature|language arts)\b/i;
const CONCEPT_TOPIC = /\b(grammar|vocabulary|tense|noun|pronoun|verb|adjective|adverb|preposition|conjunction|punctuation|spelling|writing|letter|essay|comprehension skill|figure of speech|metaphor|simile)\b/i;
const STORY_REQUEST = /\b(story|poem|passage|chapter|character|plot|event|happen|why did|summary|summarise|summarize|theme|moral|author|speaker|line|stanza|answer|question)\b/i;
const SHORT_CONTINUATION = /^(?:yes|yeah|yep|ok|okay|sure|continue|please|go ahead|that one)[.!\s]*$/i;
const SOURCE_REQUEST = /\b(upload|attach|share|send|show|photo|image|page|passage|textbook)\b/i;
const EXERCISE_ONLY = /(?:answer the following|questions? and answers?|exercise|comprehension questions?|tick the correct|fill in the blanks)/i;
const DIRECT_LANGUAGE_EXERCISE = /\b(?:meaning|means|synonym|antonym|word|vocabulary|spell|spelling|noun|pronoun|verb|adjective|adverb|preposition|conjunction|tense|grammar|fill in the blank)\b/i;

export const SOURCE_REQUIRED_CODE = "authoritative_source_required";
export const SOURCE_REQUIRED_MESSAGE =
  "I need the relevant textbook page or a clearly readable passage to answer this accurately. A title or exercise question does not establish the story facts or its answer. Please upload the page that contains the passage; I can answer the readable parts and point out anything still missing.";

export function isSourceDependentLiterature({ subject = "", chapter = "", topic = "", question = "" } = {}) {
  if (!LITERATURE_SUBJECT.test(String(subject))) return false;
  if (CONCEPT_TOPIC.test(String(question)) || CONCEPT_TOPIC.test(`${topic} ${chapter}`)) return false;
  return STORY_REQUEST.test(`${chapter} ${topic} ${question}`) || Boolean(String(chapter).trim());
}

export function isDirectLanguageExerciseQuestion(value = "") {
  return DIRECT_LANGUAGE_EXERCISE.test(String(value));
}

export function isShortContinuation(value = "") {
  return SHORT_CONTINUATION.test(String(value).trim());
}

export function previousTurnRequestedSource(history = []) {
  const previous = immediatelyPrecedingAssistantTurn(history);
  return Boolean(previous && SOURCE_REQUEST.test(previous.content) && /\b(need|please|could|can|relevant|passage|page)\b/i.test(previous.content));
}

export function immediatelyPrecedingAssistantTurn(history = []) {
  const turns = Array.isArray(history) ? history : [];
  const previous = turns.at(-1);
  return previous?.role === "assistant" && typeof previous?.content === "string"
    ? previous
    : null;
}

export function shortReplyContext(reply = "", history = []) {
  if (!isShortContinuation(reply)) return null;
  const previous = immediatelyPrecedingAssistantTurn(history);
  if (!previous) return null;
  return {
    teacherTurn: previous.content.trim(),
    requestsSource: previousTurnRequestedSource(history),
  };
}

export function inspectTextEvidence(value = "") {
  const text = String(value || "").trim();
  if (!text) return { usable: false, kind: "none", text: "" };
  const questionMarks = (text.match(/\?/g) || []).length;
  const exerciseOnly = EXERCISE_ONLY.test(text) && (questionMarks >= 2 || !/[.!][\s\n]+[A-Z\u0900-\u097f\u0980-\u09ff]/u.test(text));
  if (exerciseOnly) return { usable: false, kind: "exercise_only", text };
  if (text.length < 160) return { usable: false, kind: "insufficient", text };
  return { usable: true, kind: "passage", text };
}

export function sourceRequiredResponse(extra = {}) {
  return {
    ok: false,
    code: SOURCE_REQUIRED_CODE,
    error: SOURCE_REQUIRED_MESSAGE,
    sourceRequired: true,
    ...extra,
  };
}

function provenanceSecret() {
  return process.env.NEOLEARN_SOURCE_PROVENANCE_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_ROLE
    || "";
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Buffer.from(signature).toString("base64url");
}

function provenancePayload({ studentId = "", subject = "", chapter = "", topic = "", content = "" } = {}) {
  return JSON.stringify({
    v: 1,
    studentId: String(studentId),
    subject: String(subject),
    chapter: String(chapter),
    topic: String(topic),
    content: String(content).trim(),
  });
}

export async function createSourceProvenance(input, secret = provenanceSecret()) {
  if (!secret || !String(input?.content || "").trim()) return "";
  const encoded = base64UrlEncode(provenancePayload(input));
  return `${encoded}.${await hmac(encoded, secret)}`;
}

export async function verifySourceProvenance(input, token, secret = provenanceSecret()) {
  if (!secret || typeof token !== "string") return false;
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return false;
  let decoded;
  try {
    decoded = JSON.parse(base64UrlDecode(encoded));
  } catch {
    return false;
  }
  const expectedPayload = provenancePayload(input);
  if (provenancePayload(decoded) !== expectedPayload || decoded?.v !== 1) return false;
  const expectedSignature = await hmac(encoded, secret);
  if (expectedSignature.length !== suppliedSignature.length) return false;
  let difference = 0;
  for (let index = 0; index < expectedSignature.length; index += 1) {
    difference |= expectedSignature.charCodeAt(index) ^ suppliedSignature.charCodeAt(index);
  }
  return difference === 0;
}
