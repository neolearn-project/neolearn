export const CLASSROOM_HISTORY_MAX_MESSAGES = 12;
export const CLASSROOM_HISTORY_MAX_MESSAGE_CHARS = 1_200;
export const CLASSROOM_HISTORY_MAX_CHARS = 6_000;
export const CLASSROOM_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const CLASSROOM_IMAGE_MAX_DIMENSION = 4096;
export const CLASSROOM_IMAGE_MAX_PIXELS = 12_000_000;
export const CLASSROOM_REQUEST_MAX_BYTES = 3_500_000;

export const CLASSROOM_GROUNDING_RULES = `
- A subject, chapter, or topic title is navigation context, not evidence of a story's plot, characters, events, quotations, or answers.
- Ground factual textbook claims only in readable uploaded pages or explicit chapter material present in the conversation. Never reconstruct a story from its title or from exercise questions.
- Clearly distinguish supported textbook facts from interpretation and from a made-up illustrative example. Label examples as examples.
- If evidence is missing, answer every part supported by the available material, name what is unsupported, and request only the specific relevant story/page needed for accuracy.
- For "answer all" or equivalent requests, answer every readable numbered question and section. State which section is being answered and identify every cropped, blurred, or unreadable question instead of guessing it.
- Treat short replies such as "yes", "no", "okay", "continue", and "that one" as replies to the previous teacher turn. Continue that thread naturally; do not repeat a menu or restart the lesson unless requested.
- Be concise by default. Expand only when the student asks for detail.
`.trim();

export async function readClassroomBodyBounded(request, maxBytes = CLASSROOM_REQUEST_MAX_BYTES) {
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, text: "" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

export function classroomScopeKey({ studentId = "", subjectId = "", chapterId = "", topicId = "", sessionId = "" } = {}) {
  return [studentId, subjectId, chapterId, topicId, sessionId].map(String).join(":");
}

export async function authenticateAndAuthorizeClassroom({ authenticate, authorize }) {
  const identity = await authenticate();
  await authorize(identity);
  return identity;
}

export function buildClassroomHistory({ messages = [], openingExplanation = "", currentQuestion = "" } = {}) {
  const cleanMessages = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const role = message?.author === "You" || message?.role === "user"
      ? "user"
      : message?.author === "Teacher" || message?.role === "assistant"
        ? "assistant"
        : null;
    const content = typeof message?.text === "string"
      ? message.text.trim()
      : typeof message?.content === "string" ? message.content.trim() : "";
    if (!role || !content || message?.isError) continue;
    cleanMessages.push({ role, content: content.slice(0, CLASSROOM_HISTORY_MAX_MESSAGE_CHARS) });
  }

  const normalizedQuestion = normalizeText(currentQuestion);
  if (normalizedQuestion && cleanMessages.at(-1)?.role === "user"
      && normalizeText(cleanMessages.at(-1).content) === normalizedQuestion) {
    cleanMessages.pop();
  }

  const opening = typeof openingExplanation === "string" ? openingExplanation.trim() : "";
  const openingTurn = opening
    ? { role: "assistant", content: opening.slice(0, CLASSROOM_HISTORY_MAX_MESSAGE_CHARS) }
    : null;
  const recent = cleanMessages.slice(-CLASSROOM_HISTORY_MAX_MESSAGES);
  const uniqueRecent = openingTurn
    ? recent.filter((turn) => turn.content !== openingTurn.content)
    : recent;
  let remaining = CLASSROOM_HISTORY_MAX_CHARS - (openingTurn?.content.length || 0);
  const bounded = [];
  for (const turn of uniqueRecent.slice().reverse()) {
    if (remaining <= 0) break;
    const content = turn.content.slice(0, remaining);
    if (!content) continue;
    bounded.push({ role: turn.role, content });
    remaining -= content.length;
  }
  return openingTurn ? [openingTurn, ...bounded.reverse()] : bounded.reverse();
}

export function validateClassroomHistory(value, currentQuestion = "") {
  if (!Array.isArray(value) || value.length > CLASSROOM_HISTORY_MAX_MESSAGES + 1) {
    return { ok: false, error: "invalid_history" };
  }
  const history = [];
  let total = 0;
  for (const turn of value) {
    if (!turn || typeof turn !== "object" || !["user", "assistant"].includes(turn.role)
        || typeof turn.content !== "string") {
      return { ok: false, error: "invalid_history" };
    }
    const content = turn.content.trim();
    if (!content || content.length > CLASSROOM_HISTORY_MAX_MESSAGE_CHARS) {
      return { ok: false, error: "invalid_history" };
    }
    total += content.length;
    if (total > CLASSROOM_HISTORY_MAX_CHARS) return { ok: false, error: "invalid_history" };
    history.push({ role: turn.role, content });
  }
  const last = history.at(-1);
  if (last?.role === "user" && normalizeText(last.content) === normalizeText(currentQuestion)) {
    history.pop();
  }
  return { ok: true, history };
}

export function buildClassroomProviderInput({ systemPrompt, history = [], userPrompt, imageDataUrl = null }) {
  const input = [{ role: "system", content: String(systemPrompt || "") }];
  for (const turn of history) input.push({ role: turn.role, content: turn.content });
  const content = [{ type: "input_text", text: String(userPrompt || "") }];
  if (imageDataUrl) {
    content.push({ type: "input_image", image_url: imageDataUrl, detail: "high" });
  }
  input.push({ role: "user", content });
  return input;
}

export async function callClassroomProvider(client, model, input) {
  return client.responses.create({ model, input });
}

export async function sha256Text(value) {
  return sha256Bytes(new TextEncoder().encode(String(value)));
}

export async function validateClassroomJpegDataUrl(value) {
  if (typeof value !== "string") return { ok: false, error: "invalid_image" };
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return { ok: false, error: "unsupported_image" };
  const encoded = match[1];
  let binary;
  try { binary = atob(encoded); } catch { return { ok: false, error: "invalid_image" }; }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (!bytes.length || bytesToBase64(bytes) !== encoded) return { ok: false, error: "invalid_image" };
  if (bytes.length > CLASSROOM_IMAGE_MAX_BYTES) return { ok: false, error: "image_too_large" };
  const dimensions = readJpegDimensions(bytes);
  if (!dimensions) return { ok: false, error: "unreadable_image" };
  if (dimensions.width > CLASSROOM_IMAGE_MAX_DIMENSION
      || dimensions.height > CLASSROOM_IMAGE_MAX_DIMENSION
      || dimensions.width * dimensions.height > CLASSROOM_IMAGE_MAX_PIXELS) {
    return { ok: false, error: "image_dimensions_too_large" };
  }
  return {
    ok: true,
    dataUrl: value,
    bytes,
    sha256: await sha256Bytes(bytes),
    ...dimensions,
  };
}

function readJpegDimensions(bytes) {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8
      || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  let dimensions = null;
  let foundScan = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = readUint16BE(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (sofMarkers.has(marker)) {
      if (length < 8) return null;
      const height = readUint16BE(bytes, offset + 3);
      const width = readUint16BE(bytes, offset + 5);
      if (!width || !height) return null;
      dimensions = { width, height };
    }
    offset += length;
    if (marker === 0xda) {
      foundScan = true;
      break;
    }
  }
  return foundScan ? dimensions : null;
}

async function sha256Bytes(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readUint16BE(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
