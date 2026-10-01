export const NEW_TOPIC_TEST_QUESTION_COUNT = 10;

const GROUNDING_FRAMES = new Set(["assertion", "negation", "comparison", "belief", "hypothetical"]);
const GROUNDING_POLARITIES = new Set(["positive", "negative"]);
const EN_NEGATION = /\b(?:not|never|no|neither|nor|without|didn't|doesn't|wasn't|weren't|isn't|aren't|cannot|can't)\b/i;
const HI_NEGATION = /(?:नहीं|नही|मत|बिना|कभी\s+नहीं)/u;
const BN_NEGATION = /(?:না|নয়|নয়|নেই|নাই|কখনও\s+না)/u;
const COMPARISON_CUE = /\b(?:like|as if|as though|similar to|resembled|compared with|unlike|rather than)\b|(?:जैसे|की\s+तरह|मानो|समान)|(?:মতো|যেন|তুলনা)/iu;
const BELIEF_CUE = /\b(?:thought|believed|imagined|dreamed|hoped|feared|wondered|pretended)\b|(?:सोचा|माना|कल्पना|विश्वास|लगा)|(?:ভেবেছিল|মনে\s+করেছিল|কল্পনা|বিশ্বাস|মনে\s+হলো)/iu;
const HYPOTHETICAL_CUE = /\b(?:might|could|would|perhaps|possibly|if)\b|(?:शायद|होता|होती|मानो)|(?:হয়তো|হতো|যদি)/iu;

function includesExactPhrase(text, phrase) {
  const normalizedText = String(text || "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const normalizedPhrase = String(phrase || "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  if (!normalizedPhrase) return false;
  if (/^[\p{L}\p{N} ]+$/u.test(normalizedPhrase)) {
    const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "iu").test(normalizedText);
  }
  return normalizedText.includes(normalizedPhrase);
}

function quoteIsVerbatim(quote, passage) {
  const normalizedQuote = String(quote || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  const normalizedPassage = String(passage || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalizedQuote.length >= 12 && normalizedPassage.includes(normalizedQuote);
}

function quoteHasNegation(quote) {
  const text = String(quote || "");
  return EN_NEGATION.test(text) || HI_NEGATION.test(text) || BN_NEGATION.test(text);
}

function quoteHasComparison(quote) {
  return COMPARISON_CUE.test(String(quote || ""));
}

function quoteHasBelief(quote) {
  return BELIEF_CUE.test(String(quote || ""));
}

function quoteHasHypothetical(quote) {
  return HYPOTHETICAL_CUE.test(String(quote || ""));
}

function validFactEvidence(fact, passage) {
  if (!fact || !fact.claim || !fact.evidence || !fact.actor || !fact.predicate || !fact.actorPredicate) return false;
  if (!GROUNDING_FRAMES.has(fact.frame) || !GROUNDING_POLARITIES.has(fact.polarity)) return false;
  if (!quoteIsVerbatim(fact.evidence, passage)) return false;
  if (!includesExactPhrase(fact.evidence, fact.actor) || !includesExactPhrase(fact.claim, fact.actor)) return false;
  if (!includesExactPhrase(fact.evidence, fact.predicate) || !includesExactPhrase(fact.claim, fact.predicate)) return false;
  if (!includesExactPhrase(fact.evidence, fact.actorPredicate) || !includesExactPhrase(fact.claim, fact.actorPredicate)) return false;

  const quoteNegated = quoteHasNegation(fact.evidence);
  const quoteCompared = quoteHasComparison(fact.evidence);
  const quoteBelief = quoteHasBelief(fact.evidence);
  const quoteHypothetical = quoteHasHypothetical(fact.evidence);
  if (quoteNegated !== (fact.polarity === "negative")) return false;
  if (fact.polarity === "negative" && fact.frame !== "negation") return false;
  if (quoteCompared && !["comparison", "belief", "hypothetical"].includes(fact.frame)) return false;
  if (quoteBelief && fact.frame !== "belief") return false;
  if (quoteHypothetical && !["hypothetical", "belief"].includes(fact.frame)) return false;
  if (fact.frame === "negation" && !quoteHasNegation(fact.claim)) return false;
  if (fact.frame === "comparison" && !quoteHasComparison(fact.claim)) return false;
  if (fact.frame === "belief" && !quoteHasBelief(fact.claim)) return false;
  if (fact.frame === "hypothetical" && !quoteHasHypothetical(fact.claim)) return false;
  if (fact.frame === "belief" && (!fact.attribution || !includesExactPhrase(fact.evidence, fact.attribution) || !includesExactPhrase(fact.claim, fact.attribution))) return false;
  if (fact.frame !== "belief" && fact.attribution && !includesExactPhrase(fact.evidence, fact.attribution)) return false;
  return true;
}

function validGroundingComponent(component, facts, passage) {
  if (!component || typeof component.claim !== "string" || !component.claim.trim()) return false;
  const ids = Array.isArray(component.factIds) ? component.factIds : [];
  if (!ids.length) return false;
  const linkedFacts = ids.map((id) => facts.get(String(id)));
  if (linkedFacts.some((fact) => !fact || !validFactEvidence(fact, passage))) return false;
  const frames = new Set(linkedFacts.map((fact) => fact.frame));
  if (frames.size > 1) return false;
  const frame = linkedFacts[0].frame;
  // The generated canonical claim must carry the source-language actor/action
  // relation itself; merely attaching a true quote to an unrelated claim is
  // not grounding. Output-language wording may differ (Hindi/Bengali included).
  if (!linkedFacts.every((fact) => includesExactPhrase(component.claim, fact.actor)
      && includesExactPhrase(component.claim, fact.actorPredicate)
      && includesExactPhrase(component.claim, fact.predicate))) return false;
  if (component.treatment !== frame) return false;
  if (frame === "negation" && !quoteHasNegation(component.claim)) return false;
  if (frame === "comparison" && !quoteHasComparison(component.claim)) return false;
  if (frame === "belief" && !quoteHasBelief(component.claim)) return false;
  if (frame === "hypothetical" && !quoteHasHypothetical(component.claim)) return false;
  if (frame === "belief" && !linkedFacts.every((fact) => includesExactPhrase(component.claim, fact.attribution))) return false;
  return true;
}

/**
 * Accept only generated items whose source-language fact map, exact evidence,
 * actor/predicate references, polarity, and narrative framing agree. This is a
 * conservative consistency gate, not a semantic entailment proof.
 */
export function selectTextbookGroundedTopicQuestions(questions, passage) {
  const valid = selectValidDistinctTopicQuestions(questions, Number.MAX_SAFE_INTEGER);
  return valid.filter((question) => {
    const grounding = question?.grounding;
    const facts = new Map((Array.isArray(grounding?.facts) ? grounding.facts : []).map((fact) => [String(fact.id), fact]));
    if (!facts.size) return false;
    return validGroundingComponent(grounding.premise, facts, passage)
      && validGroundingComponent(grounding.answer, facts, passage)
      && validGroundingComponent(grounding.explanation, facts, passage);
  });
}

export function shuffleTopicTestOptions(questions, random = Math.random) {
  return (Array.isArray(questions) ? questions : []).map((question) => {
    const options = [...question.options];
    const correctAnswer = options[question.correctIndex];
    for (let index = options.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [options[index], options[swapIndex]] = [options[swapIndex], options[index]];
    }
    return { ...question, options, correctIndex: options.indexOf(correctAnswer) };
  });
}

export function topicTestQuestionSignature(value) {
  return String(value || "")
    .toLowerCase()
    // Combining vowel signs and other marks are part of Hindi/Bengali words;
    // treating them as separators can reduce a valid question to no signature.
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 16)
    .join(" ");
}

export function selectValidDistinctTopicQuestions(questions, count = NEW_TOPIC_TEST_QUESTION_COUNT) {
  const result = [];
  const seen = new Set();
  for (const question of Array.isArray(questions) ? questions : []) {
    const options = Array.isArray(question?.options) ? question.options.map((option) => String(option).trim()) : [];
    const signature = topicTestQuestionSignature(question?.question);
    const optionKeys = options.map((option) => option.toLowerCase().replace(/\s+/g, " "));
    if (!signature || seen.has(signature) || options.length !== 4 || new Set(optionKeys).size !== 4
        || !Number.isInteger(question?.correctIndex) || question.correctIndex < 0 || question.correctIndex >= 4) continue;
    seen.add(signature);
    result.push({ ...question, id: result.length + 1, options });
    if (result.length === count) break;
  }
  return result;
}

export function scoreTopicTest(questions, answers) {
  const valid = selectValidDistinctTopicQuestions(questions, Number.MAX_SAFE_INTEGER);
  const correct = valid.reduce((total, question) => total + (answers?.[question.id] === question.correctIndex ? 1 : 0), 0);
  return { correct, total: valid.length, percent: valid.length ? Math.round((correct / valid.length) * 100) : 0 };
}
