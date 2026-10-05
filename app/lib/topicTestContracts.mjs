export const NEW_TOPIC_TEST_QUESTION_COUNT = 10;

const FRAMES = new Set(["assertion", "negation", "comparison", "belief", "hypothetical"]);
const POLARITIES = new Set(["positive", "negative"]);
const NEGATION = /\b(?:not|never|no|neither|nor|without|didn't|doesn't|wasn't|weren't|isn't|aren't|cannot|can't)\b|(?:नहीं|नही|मत|बिना|कभी\s+नहीं)|(?:না|নয়|নয়|নেই|নাই|কখনও\s+না)/iu;
const COMPARISON = /\b(?:as if|as though|similar to|resembled|compared (?:to|with)|unlike|rather than)\b|(?:जैसे|की\s+तरह|मानो|समान)|(?:মতো|যেন|তুলনা)/iu;
const BELIEF = /\b(?:thought|believed|imagined|dreamed|hoped|feared|wondered|pretended)\b|(?:सोचा|माना|कल्पना|विश्वास|लगा)|(?:ভেবেছিল|মনে\s+করেছিল|কল্পনা|বিশ্বাস|মনে\s+হলো)/iu;
const HYPOTHETICAL = /\b(?:might|would|perhaps|possibly|maybe|if|whether)\b|(?:शायद|होता|होती|मानो)|(?:হয়তো|হতো|যদি)/iu;
const BELIEF_INFINITIVE = /\b(?:believe|believes)\b/i;
const PRONOUN = /^(?:he|she|they|it|him|her|them|his|hers|their|its)$/i;
const STOP_WORDS = new Set("a an the this that these those is are was were be been being do does did had have has to of in on at by for from with and or but as who what when where why how which her his their its she he they it can would should may might passage say says said about".split(" "));
const ENGLISH_EQUIVALENTS = new Map(Object.entries({
  ability: "could", able: "could", identified: "identify", identifies: "identify",
  crossed: "cross", crossing: "cross", kinds: "kind", shells: "shell",
  collected: "collect", collecting: "collect", arranged: "arrange", recorded: "record",
  colours: "colour", colors: "colour", labelled: "label", labeled: "label",
  sounded: "compare", sounds: "compare", compared: "compare", comparing: "compare",
  believed: "believe", believes: "believe", believing: "believe",
}));

export const TOPIC_TEST_REJECTION_CODES = Object.freeze({
  invalid_shape: "invalid_shape", duplicate: "duplicate", missing_grounding: "missing_grounding",
  evidence_missing_fields: "evidence_missing_fields",
  evidence_non_verbatim_quote: "evidence_non_verbatim_quote",
  evidence_actor_predicate_mismatch: "evidence_actor_predicate_mismatch",
  evidence_polarity_mismatch: "evidence_polarity_mismatch",
  evidence_framing_mismatch: "evidence_framing_mismatch",
  evidence_attribution_mismatch: "evidence_attribution_mismatch",
  evidence_unsupported_claim: "evidence_unsupported_claim",
  actor_conflict: "actor_conflict",
  unsupported_claim: "unsupported_claim", displayed_content_mismatch: "displayed_content_mismatch",
  framing_mismatch: "framing_mismatch",
});

function normalized(value) { return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim(); }
function includesExactPhrase(text, phrase) {
  const haystack = normalized(text); const needle = normalized(phrase);
  if (!needle) return false;
  if (/^[\p{L}\p{N} ]+$/u.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "iu").test(haystack);
  }
  return haystack.includes(needle);
}
function quoteIsVerbatim(quote, passage) {
  const value = String(quote || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return value.length >= 12 && String(passage || "").normalize("NFKC").replace(/\s+/g, " ").includes(value);
}
function hasComparison(value) {
  const text = String(value || "");
  return COMPARISON.test(text) || /\b(?:looked|looks|sounded|sounds|seemed|seems|ran|runs|moved|moves|sang|sings)\s+like\b/i.test(text);
}
function hasHypothetical(value) {
  const text = String(value || "");
  return HYPOTHETICAL.test(text) || (/\bcould\b/i.test(text) && /\b(?:if|perhaps|possibly|maybe|but|whether)\b/i.test(text));
}
function hasBelief(value) { return BELIEF.test(String(value || "")) || BELIEF_INFINITIVE.test(String(value || "")); }
function supportedProposition(fact) {
  const evidence = String(fact?.evidence || "");
  const anchors = [fact?.actorPredicate, fact?.predicate].map((value) => String(value || "")).filter(Boolean);
  const positions = anchors.map((anchor) => normalized(evidence).indexOf(normalized(anchor))).filter((index) => index >= 0);
  if (!positions.length) return evidence;
  const start = Math.max(0, evidence.lastIndexOf(",", Math.min(...positions)) + 1);
  const end = evidence.indexOf(",", Math.max(...positions));
  return evidence.slice(start, end < 0 ? evidence.length : end).trim();
}
function tokens(value) { return normalized(value).match(/[\p{L}\p{N}]+/gu)?.filter((token) => (/^\p{N}+$/u.test(token) || token.length > 2) && !STOP_WORDS.has(token)).map((token) => ENGLISH_EQUIVALENTS.get(token) || token.replace(/(?<!s)s$/i, "")) || []; }
function scripts(value) {
  const result = new Set();
  if (/\p{Script=Latin}/u.test(value)) result.add("latin");
  if (/\p{Script=Devanagari}/u.test(value)) result.add("devanagari");
  if (/\p{Script=Bengali}/u.test(value)) result.add("bengali");
  return result;
}
function properNames(value) { return [...String(value || "").matchAll(/(?:^|[.!?]\s+|\s)([A-Z][a-z]{2,})\b/g)].map((match) => match[1].toLowerCase()).filter((name) => !PRONOUN.test(name) && name !== "the"); }
function actorConflict(claim, fact, passage) {
  // Capitalisation alone does not make a token an actor: question words and
  // sentence-initial adjectives are common. Only names established as source
  // entities can conflict with the actor attached to this verified evidence.
  const sourceEntities = new Set(properNames(passage));
  const names = properNames(claim).filter((name) => sourceEntities.has(name)); if (!names.length) return false;
  const allowed = new Set(properNames(supportedProposition(fact)));
  if (!PRONOUN.test(fact.actor)) allowed.add(String(fact.actor).toLowerCase());
  if (PRONOUN.test(fact.actor)) {
    const at = String(passage).indexOf(String(fact.evidence));
    const antecedent = properNames(at < 0 ? "" : String(passage).slice(0, at)).at(-1);
    if (antecedent) allowed.add(antecedent);
  }
  return names.some((name) => !allowed.has(name));
}
function precedingPronounContext(fact, passage) {
  const evidence = String(fact?.evidence || "");
  if (!/\b(?:he|she|they|it|him|her|them|his|hers|their|its)\b/i.test(evidence)) return "";
  const at = String(passage).indexOf(evidence);
  if (at <= 0) return "";
  return String(passage).slice(0, at).split(/[.!?]/).map((part) => part.trim()).filter(Boolean).at(-1) || "";
}
function claimSupported(claim, fact, passage = "") {
  // Generated fact.claim is deliberately excluded: only the verified quote and
  // its exact actor/predicate fields may support another generated statement.
  const evidenceAt = String(passage).indexOf(String(fact.evidence || ""));
  const antecedent = PRONOUN.test(fact.actor) && evidenceAt >= 0 ? properNames(String(passage).slice(0, evidenceAt)).at(-1) || "" : "";
  const pronounContext = precedingPronounContext(fact, passage);
  const source = new Set(tokens(`${supportedProposition(fact)} ${fact.actor} ${fact.actorPredicate} ${fact.predicate} ${antecedent} ${pronounContext}`));
  const claimed = [...new Set(tokens(claim))];
  return claimed.length > 0 && claimed.every((token) => source.has(token));
}
function factEvidenceRejection(fact, passage) {
  if (!fact?.claim || !fact?.evidence || !fact?.actor || !fact?.predicate || !fact?.actorPredicate || !fact?.frame || !fact?.polarity) return TOPIC_TEST_REJECTION_CODES.evidence_missing_fields;
  if (!quoteIsVerbatim(fact.evidence, passage)) return TOPIC_TEST_REJECTION_CODES.evidence_non_verbatim_quote;
  if (!includesExactPhrase(fact.evidence, fact.actor) || !includesExactPhrase(fact.evidence, fact.predicate) || !includesExactPhrase(fact.evidence, fact.actorPredicate)) return TOPIC_TEST_REJECTION_CODES.evidence_actor_predicate_mismatch;
  const proposition = supportedProposition(fact);
  const negated = NEGATION.test(proposition), compared = hasComparison(proposition), believed = hasBelief(proposition), hypothetical = hasHypothetical(proposition);
  if (!POLARITIES.has(fact.polarity) || negated !== (fact.polarity === "negative")) return TOPIC_TEST_REJECTION_CODES.evidence_polarity_mismatch;
  if (!FRAMES.has(fact.frame) || (negated && fact.frame !== "negation") || (compared && !["comparison", "belief", "hypothetical"].includes(fact.frame)) || (believed && fact.frame !== "belief") || (hypothetical && !["hypothetical", "belief"].includes(fact.frame))) return TOPIC_TEST_REJECTION_CODES.evidence_framing_mismatch;
  if ((fact.frame === "negation" && !NEGATION.test(fact.claim)) || (fact.frame === "comparison" && !hasComparison(fact.claim)) || (fact.frame === "belief" && !hasBelief(fact.claim)) || (fact.frame === "hypothetical" && !hasHypothetical(fact.claim))) return TOPIC_TEST_REJECTION_CODES.evidence_framing_mismatch;
  if (fact.frame === "belief" && (!fact.attribution || !includesExactPhrase(fact.evidence, fact.attribution))) return TOPIC_TEST_REJECTION_CODES.evidence_attribution_mismatch;
  if (actorConflict(fact.claim, fact, passage) || !claimSupported(fact.claim, fact, passage)) return TOPIC_TEST_REJECTION_CODES.evidence_unsupported_claim;
  return null;
}
function componentRejection(component, facts, passage) {
  if (!component?.claim?.trim() || !Array.isArray(component.factIds) || !component.factIds.length) return TOPIC_TEST_REJECTION_CODES.missing_grounding;
  const linked = component.factIds.map((id) => facts.get(String(id)));
  if (linked.some((fact) => !fact)) return TOPIC_TEST_REJECTION_CODES.evidence_missing_fields;
  for (const fact of linked) {
    const rejection = factEvidenceRejection(fact, passage);
    if (rejection) return rejection;
  }
  const frames = new Set(linked.map((fact) => fact.frame));
  if (frames.size !== 1 || component.treatment !== linked[0].frame) return TOPIC_TEST_REJECTION_CODES.framing_mismatch;
  if (linked.some((fact) => actorConflict(component.claim, fact, passage))) return TOPIC_TEST_REJECTION_CODES.actor_conflict;
  if (!linked.every((fact) => claimSupported(component.claim, fact, passage))) return TOPIC_TEST_REJECTION_CODES.unsupported_claim;
  const frame = linked[0].frame;
  if ((frame === "negation" && !NEGATION.test(component.claim)) || (frame === "comparison" && !hasComparison(component.claim)) || (frame === "belief" && !hasBelief(component.claim)) || (frame === "hypothetical" && !hasHypothetical(component.claim))) return TOPIC_TEST_REJECTION_CODES.framing_mismatch;
  if (frame === "belief" && !linked.every((fact) => includesExactPhrase(component.claim, fact.attribution))) return TOPIC_TEST_REJECTION_CODES.framing_mismatch;
  return null;
}

function displayedComponentRejection(component, displayed, facts, passage, kind) {
  /*
   * Deterministic scope: displayText proves which UI string was reviewed, and
   * same-script content words, actors, and framing are checked against verified
   * evidence. For English-source Hindi/Bengali output, exact display binding and
   * framing are enforceable, but semantic translation equivalence is not. The
   * generated source-language claim remains an auditable bridge, not a proof.
   */
  if (!component || normalized(component.displayText) !== normalized(displayed)) return TOPIC_TEST_REJECTION_CODES.displayed_content_mismatch;
  const linked = component.factIds.map((id) => facts.get(String(id))).filter(Boolean);
  const displayScripts = scripts(String(displayed || ""));
  const sourceScripts = scripts(linked.map((fact) => supportedProposition(fact)).join(" "));
  const sharesScript = [...displayScripts].some((script) => sourceScripts.has(script));
  if (linked.some((fact) => actorConflict(displayed, fact, passage))) return TOPIC_TEST_REJECTION_CODES.actor_conflict;
  if (sharesScript && !linked.every((fact) => claimSupported(displayed, fact, passage))) return TOPIC_TEST_REJECTION_CODES.displayed_content_mismatch;
  // A correct-option fragment (for example "the bridge" or "a monkey's
  // call") need not repeat the question's negation/comparison cue.
  const frame = linked[0]?.frame;
  if (kind !== "answer" && ((frame === "negation" && !NEGATION.test(displayed)) || (frame === "comparison" && !hasComparison(displayed)) || (frame === "belief" && !hasBelief(displayed)) || (frame === "hypothetical" && !hasHypothetical(displayed)))) return TOPIC_TEST_REJECTION_CODES.framing_mismatch;
  return null;
}

export function analyzeTextbookGroundedTopicQuestions(questions, passage) {
  const accepted = [], rejectionCodes = {}, seen = new Set(); let duplicateCount = 0;
  for (const question of Array.isArray(questions) ? questions : []) {
    const shaped = selectValidDistinctTopicQuestions([question], 1)[0];
    let rejection = shaped ? null : TOPIC_TEST_REJECTION_CODES.invalid_shape;
    const signature = topicTestQuestionSignature(question?.question);
    if (!rejection && seen.has(signature)) { rejection = TOPIC_TEST_REJECTION_CODES.duplicate; duplicateCount += 1; }
    const grounding = question?.grounding;
    const facts = new Map((Array.isArray(grounding?.facts) ? grounding.facts : []).map((fact) => [String(fact.id), fact]));
    if (!rejection && !facts.size) rejection = TOPIC_TEST_REJECTION_CODES.missing_grounding;
    for (const component of [grounding?.premise, grounding?.answer, grounding?.explanation]) if (!rejection) rejection = componentRejection(component, facts, passage);
    const displayed = [question?.question, question?.options?.[question?.correctIndex], question?.explanation];
    const componentKinds = ["premise", "answer", "explanation"];
    const components = [grounding?.premise, grounding?.answer, grounding?.explanation];
    for (let index = 0; index < components.length && !rejection; index += 1) rejection = displayedComponentRejection(components[index], displayed[index], facts, passage, componentKinds[index]);
    if (rejection) rejectionCodes[rejection] = (rejectionCodes[rejection] || 0) + 1;
    else { seen.add(signature); accepted.push({ ...shaped, id: accepted.length + 1 }); }
  }
  return { accepted, generatedCount: Array.isArray(questions) ? questions.length : 0, acceptedCount: accepted.length, duplicateCount, rejectionCodes };
}
export function selectTextbookGroundedTopicQuestions(questions, passage) { return analyzeTextbookGroundedTopicQuestions(questions, passage).accepted; }
export function shuffleTopicTestOptions(questions, random = Math.random) {
  return (Array.isArray(questions) ? questions : []).map((question) => {
    const options = [...question.options], correctAnswer = options[question.correctIndex];
    for (let index = options.length - 1; index > 0; index -= 1) { const swapIndex = Math.floor(random() * (index + 1)); [options[index], options[swapIndex]] = [options[swapIndex], options[index]]; }
    return { ...question, options, correctIndex: options.indexOf(correctAnswer) };
  });
}
export function topicTestQuestionSignature(value) { return normalized(value).replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim().split(/\s+/).filter((word) => word.length > 2).slice(0, 16).join(" "); }
export function selectValidDistinctTopicQuestions(questions, count = NEW_TOPIC_TEST_QUESTION_COUNT) {
  const result = [], seen = new Set();
  for (const question of Array.isArray(questions) ? questions : []) {
    const options = Array.isArray(question?.options) ? question.options.map((option) => String(option).trim()) : [];
    const signature = topicTestQuestionSignature(question?.question), optionKeys = options.map((option) => normalized(option));
    if (!signature || seen.has(signature) || options.length !== 4 || new Set(optionKeys).size !== 4 || !Number.isInteger(question?.correctIndex) || question.correctIndex < 0 || question.correctIndex >= 4) continue;
    seen.add(signature); result.push({ ...question, id: result.length + 1, options }); if (result.length === count) break;
  }
  return result;
}
export function scoreTopicTest(questions, answers) {
  const valid = selectValidDistinctTopicQuestions(questions, Number.MAX_SAFE_INTEGER);
  const correct = valid.reduce((total, question) => total + (answers?.[question.id] === question.correctIndex ? 1 : 0), 0);
  return { correct, total: valid.length, percent: valid.length ? Math.round((correct / valid.length) * 100) : 0 };
}
