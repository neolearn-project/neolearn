// app/lib/personaEngine.ts
export type PreferredSpeed = "slow" | "normal" | "fast";
export type ExplainStyle = "simple" | "detailed" | "example_first" | "step_by_step";

export type PersonaProfile = {
  preferred_language?: "en" | "hi" | "bn";
  preferred_speed?: PreferredSpeed;
  explain_style?: ExplainStyle;
  weak_topic_ids?: string[];      // you already have jsonb in DB
  persona_summary?: string;       // optional later (Phase B2)
};

export type PersonaSignals = {
  question: string;
  topicId?: string | null;
  chapterId?: string | null;
  subjectId?: string | null;
  lang?: "en" | "hi" | "bn";
  // Optional signals (if you later send these from UI)
  responseTimeSec?: number | null;
  retries?: number | null;
};

export type PersonaDecision = {
  speed: PreferredSpeed;
  style: ExplainStyle;
  language: "en" | "hi" | "bn";
  weakTopicAdd?: string | null;
  notes: string[]; // debug log
};

function hasHindi(text: string) {
  return /[\u0900-\u097F]/.test(text);
}
function hasBengali(text: string) {
  return /[\u0980-\u09FF]/.test(text);
}

export function decidePersona(
  profile: PersonaProfile | null,
  signals: PersonaSignals
): PersonaDecision {
  const notes: string[] = [];

  const q = (signals.question || "").trim();
  const qLower = q.toLowerCase();

  // -------- language --------
  let language: "en" | "hi" | "bn" =
    signals.lang ||
    profile?.preferred_language ||
    (hasHindi(q) ? "hi" : hasBengali(q) ? "bn" : "en");

  // -------- speed --------
  // Heuristics:
  // - very short doubts, "I don't understand", "again", etc. => slow
  // - long question with many steps => normal/fast (but usually normal)
  let speed: PreferredSpeed = profile?.preferred_speed || "normal";

  const confusionWords =
    /(don'?t understand|not understand|again|repeat|confuse|confused|samajh|samajh nahi|bojha|bujhi nai|cannot|can\'t)/i;

  if (confusionWords.test(q)) {
    speed = "slow";
    notes.push("confusion_words => slow");
  } else if (q.length < 35) {
    speed = "slow";
    notes.push("very_short_question => slow");
  } else if (q.length > 220) {
    speed = "normal";
    notes.push("long_question => normal");
  }

  // -------- style --------
  let style: ExplainStyle = profile?.explain_style || "step_by_step";

  // If they ask “example” first
  if (/(example|examples|udaharan|উদাহরণ)/i.test(q)) {
    style = "example_first";
    notes.push("asked_examples => example_first");
  } else if (/(prove|derivation|why|reason|explain why)/i.test(qLower)) {
    style = "detailed";
    notes.push("why/prove => detailed");
  } else if (speed === "slow") {
    style = "simple";
    notes.push("slow => simple");
  } else {
    style = "step_by_step";
    notes.push("default => step_by_step");
  }

  // -------- weak topic marking (lightweight) --------
  // If confusion words appear, add current topic to weak topics.
  let weakTopicAdd: string | null = null;
  if (confusionWords.test(q) && signals.topicId) {
    weakTopicAdd = signals.topicId;
    notes.push(`confusion + topicId => weakTopicAdd=${signals.topicId}`);
  }
// If topic already weak in profile, force slow + example-first
const topicId = signals.topicId ?? null;

if (
  topicId &&
  Array.isArray(profile?.weak_topic_ids) &&
  profile.weak_topic_ids.includes(topicId)
) {
  speed = "slow";
  style = style === "detailed" ? "detailed" : "example_first";
  notes.push("topic already weak => slow + example_first");
}

  return { speed, style, language, weakTopicAdd, notes };
}

export function buildPersonaInstruction(decision: PersonaDecision) {
  const speedLine =
    decision.speed === "slow"
      ? "Teach slowly. Use very short sentences. Check after each step."
      : decision.speed === "fast"
      ? "Teach quickly but clearly. Avoid unnecessary repetition."
      : "Teach at normal speed. Be clear and structured.";

  const styleLine =
    decision.style === "simple"
      ? "Use very simple words. Prefer 1 small example."
      : decision.style === "detailed"
      ? "Give deeper reasoning. Use 2 examples."
      : decision.style === "example_first"
      ? "Start with a quick example first, then explain the rule."
      : "Explain step-by-step, then 1–2 examples.";

  const langLine =
    decision.language === "hi"
      ? "Reply in simple Hindi."
      : decision.language === "bn"
      ? "Reply in simple Bengali."
      : "Reply in simple English.";

  return `${langLine}\n${speedLine}\n${styleLine}`;
}



  
