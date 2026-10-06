export const NEW_TOPIC_TEST_QUESTION_COUNT = 10;
export const TOPIC_TEST_REVIEW_REASON_CODES = Object.freeze([
  "accepted", "malformed_candidate", "unsupported_by_source", "actor_attribution",
  "wrong_quantity", "negation_or_comparison", "framing_error", "explanation_error",
  "ambiguous_options", "multiple_correct_options", "no_correct_option", "duplicate_question",
]);
export const TOPIC_TEST_REVIEW_LIMITS = Object.freeze({
  candidateId: 80, question: 1000, option: 500, explanation: 2000, references: 24,
});
export const TOPIC_TEST_SOURCE_CATALOG_LIMITS = Object.freeze({ maxSourceChars: 200000, maxScopes: 512, maxTokens: 12000, maxTokensPerScope: 192, maxFactsPerQuestion: 24 });

const FRAMES = new Set(["assertion", "negation", "comparison", "belief", "hypothetical"]);
const POLARITIES = new Set(["positive", "negative"]);
const NEGATION = /\b(?:not|never|no|neither|nor|without|didn't|doesn't|wasn't|weren't|isn't|aren't|won't|wouldn't|shouldn't|couldn't|hadn't|hasn't|haven't|cannot|can't)\b|(?:नहीं|नही|मत|बिना|कभी\s+नहीं)|(?:না|নয়|নয়|নেই|নাই|কখনও\s+না)/iu;
const COMPARISON = /\b(?:as if|as though|similar to|resembled|compared (?:to|with)|unlike|rather than)\b|(?:जैसे|की\s+तरह|मानो|समान)|(?:মতো|যেন|তুলনা)/iu;
const BELIEF = /\b(?:thought|believed|imagined|dreamed|hoped|feared|wondered|pretended)\b|(?:सोचा|माना|कल्पना|विश्वास|लगा)|(?:ভেবেছিল|মনে\s+করেছিল|কল্পনা|বিশ্বাস|মনে\s+হলো)/iu;
const HYPOTHETICAL = /\b(?:might|would|will|shall|perhaps|possibly|maybe|if|whether)\b|[’']ll\b|(?:शायद|होता|होती|मानो)|(?:হয়তো|হতো|যদি)/iu;
const BELIEF_INFINITIVE = /\b(?:believe|believes)\b/i;
const SPEECH_ATTRIBUTION = /\b(?:say|says|said|replied|asked|gasped|wailed|told|promised|advised|suggested)\b/i;
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
  evidence_unknown_scope: "evidence_unknown_scope",
  evidence_unknown_token: "evidence_unknown_token",
  evidence_reversed_range: "evidence_reversed_range",
  evidence_cross_scope_range: "evidence_cross_scope_range",
  evidence_actor_outside_actor_predicate: "evidence_actor_outside_actor_predicate",
  evidence_catalog_limits: "evidence_catalog_limits",
  evidence_unknown_excerpt: "evidence_unknown_excerpt",
  evidence_non_verbatim_quote: "evidence_non_verbatim_quote",
  evidence_actor_mismatch: "evidence_actor_mismatch",
  evidence_actor_predicate_mismatch: "evidence_actor_predicate_mismatch",
  evidence_predicate_mismatch: "evidence_predicate_mismatch",
  evidence_non_atomic_fact: "evidence_non_atomic_fact",
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
  if (!anchors.length) return evidence;
  const compactEvidence = evidence.replace(/\s+/g, " ");
  const sentences = [...compactEvidence.matchAll(/[^.!?]+(?:[.!?]+|$)/gu)].map((match) => match[0].trim()).filter(Boolean);
  const sentence = sentences.find((candidate) => anchors.every((anchor) => includesExactPhrase(candidate, anchor)));
  if (sentence) return sentence;
  const compactNormalized = normalized(compactEvidence);
  const actorPredicate = normalized(fact?.actorPredicate);
  const predicate = normalized(fact?.predicate);
  const actorPredicateAt = compactNormalized.indexOf(actorPredicate);
  const predicateAt = compactNormalized.indexOf(predicate);
  if (actorPredicateAt >= 0 && predicateAt >= 0 && SPEECH_ATTRIBUTION.test(String(fact?.actorPredicate || ""))) {
    const firstAt = Math.min(actorPredicateAt, predicateAt);
    const firstLength = actorPredicateAt < predicateAt ? actorPredicate.length : predicate.length;
    const secondAt = Math.max(actorPredicateAt, predicateAt);
    const bridge = compactNormalized.slice(firstAt + firstLength, secondAt);
    const directlyAttached = actorPredicateAt < predicateAt
      ? /^[\s,;:"'’“”‘’—-]*$/u.test(bridge)
      : /^[\s,;:!?."'’“”‘’—-]*$/u.test(bridge);
    if (directlyAttached) return compactNormalized.slice(firstAt, secondAt + (actorPredicateAt < predicateAt ? predicate.length : actorPredicate.length));
  }
  return "";
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
    const antecedent = properNames(precedingPronounContext(fact, passage)).at(-1);
    if (antecedent) allowed.add(antecedent);
  }
  return names.some((name) => !allowed.has(name));
}
function precedingPronounContext(fact, passage) {
  const evidence = String(fact?.evidence || "");
  if (!/\b(?:he|she|they|it|him|her|them|his|hers|their|its)\b/i.test(evidence)) return "";
  const proposition = supportedProposition(fact);
  const propositionAt = evidence.indexOf(proposition);
  if (propositionAt > 0) {
    const localContext = evidence.slice(0, propositionAt).split(/[.!?]/).map((part) => part.trim()).filter(Boolean).at(-1);
    if (localContext) return localContext;
  }
  const at = String(passage).indexOf(evidence);
  if (at <= 0) return "";
  return String(passage).slice(0, at).split(/[.!?]/).map((part) => part.trim()).filter(Boolean).at(-1) || "";
}
function factSupportTokens(fact, passage = "") {
  // Generated fact.claim is deliberately excluded: only the verified quote and
  // its exact actor/predicate fields may support another generated statement.
  const pronounContext = precedingPronounContext(fact, passage);
  const antecedent = PRONOUN.test(fact.actor) ? properNames(pronounContext).at(-1) || "" : "";
  return tokens(`${supportedProposition(fact)} ${fact.actor} ${fact.actorPredicate} ${fact.predicate} ${antecedent} ${pronounContext}`);
}
function claimSupported(claim, fact, passage = "") {
  const source = new Set(factSupportTokens(fact, passage));
  const claimed = [...new Set(tokens(claim))];
  return claimed.length > 0 && claimed.every((token) => source.has(token));
}
function claimSegments(claim) {
  const segments = String(claim || "")
    .split(/(?:[.!?;]+|\s+(?:and|but|while|whereas)\s+)/iu)
    .map((segment) => segment.replace(/^[\s,:'"“”‘’—-]+|[\s,:'"“”‘’—-]+$/gu, "").trim())
    .filter((segment) => tokens(segment).length > 0);
  return segments.length ? segments : [String(claim || "")];
}
function claimSupportedByFacts(claim, facts, passage = "") {
  const segments = claimSegments(claim);
  const candidates = segments.map((segment) => facts
    .map((fact, index) => claimSupported(segment, fact, passage) ? index : -1)
    .filter((index) => index >= 0));
  if (candidates.some((indexes) => !indexes.length)) return false;
  if (!facts.length || segments.length < facts.length) return false;
  let reachable = new Uint8Array(facts.length);
  if (candidates[0].includes(0)) reachable[0] = 1;
  for (let segmentIndex = 1; segmentIndex < candidates.length; segmentIndex += 1) {
    const next = new Uint8Array(facts.length);
    for (const factIndex of candidates[segmentIndex]) {
      if (reachable[factIndex] || (factIndex > 0 && reachable[factIndex - 1])) next[factIndex] = 1;
    }
    reachable = next;
  }
  return reachable[facts.length - 1] === 1;
}
function actorConflictAcrossFacts(claim, facts, passage) {
  if (facts.length === 1) return actorConflict(claim, facts[0], passage);
  return claimSegments(claim).some((segment) => facts.every((fact) => actorConflict(segment, fact, passage)));
}
function factEvidenceRejection(fact, passage) {
  if (fact?.evidenceResolution === "unknown_excerpt") return TOPIC_TEST_REJECTION_CODES.evidence_unknown_excerpt;
  if (fact?.evidenceResolution === "unknown_scope") return TOPIC_TEST_REJECTION_CODES.evidence_unknown_scope;
  if (fact?.evidenceResolution === "unknown_token") return TOPIC_TEST_REJECTION_CODES.evidence_unknown_token;
  if (fact?.evidenceResolution === "reversed_range") return TOPIC_TEST_REJECTION_CODES.evidence_reversed_range;
  if (fact?.evidenceResolution === "cross_scope") return TOPIC_TEST_REJECTION_CODES.evidence_cross_scope_range;
  if (fact?.evidenceResolution === "actor_outside_actor_predicate") return TOPIC_TEST_REJECTION_CODES.evidence_actor_outside_actor_predicate;
  if (fact?.evidenceResolution === "missing_span_fields") return TOPIC_TEST_REJECTION_CODES.evidence_missing_fields;
  if (!fact?.claim || !fact?.evidence || !fact?.actor || !fact?.predicate || !fact?.actorPredicate || !fact?.frame || !fact?.polarity) return TOPIC_TEST_REJECTION_CODES.evidence_missing_fields;
  if (!quoteIsVerbatim(fact.evidence, passage)) return TOPIC_TEST_REJECTION_CODES.evidence_non_verbatim_quote;
  if (!includesExactPhrase(fact.evidence, fact.actor)) return TOPIC_TEST_REJECTION_CODES.evidence_actor_mismatch;
  if (!includesExactPhrase(fact.evidence, fact.actorPredicate)) return TOPIC_TEST_REJECTION_CODES.evidence_actor_predicate_mismatch;
  if (!includesExactPhrase(fact.evidence, fact.predicate)) return TOPIC_TEST_REJECTION_CODES.evidence_predicate_mismatch;
  const proposition = supportedProposition(fact);
  if (!proposition) return TOPIC_TEST_REJECTION_CODES.evidence_non_atomic_fact;
  const negated = NEGATION.test(proposition), compared = hasComparison(proposition), believed = hasBelief(proposition), hypothetical = hasHypothetical(proposition);
  if (!POLARITIES.has(fact.polarity) || negated !== (fact.polarity === "negative")) return TOPIC_TEST_REJECTION_CODES.evidence_polarity_mismatch;
  if (!FRAMES.has(fact.frame) || (negated && fact.frame !== "negation") || (compared && !["comparison", "belief", "hypothetical"].includes(fact.frame)) || (believed && fact.frame !== "belief") || (hypothetical && !["hypothetical", "belief"].includes(fact.frame))) return TOPIC_TEST_REJECTION_CODES.evidence_framing_mismatch;
  if ((fact.frame === "negation" && !NEGATION.test(fact.claim)) || (fact.frame === "comparison" && !hasComparison(fact.claim)) || (fact.frame === "belief" && !hasBelief(fact.claim)) || (fact.frame === "hypothetical" && !hasHypothetical(fact.claim))) return TOPIC_TEST_REJECTION_CODES.evidence_framing_mismatch;
  const speechAttributed = SPEECH_ATTRIBUTION.test(String(fact.actorPredicate || ""));
  if ((fact.frame === "belief" || speechAttributed) && (!fact.attribution || !includesExactPhrase(fact.evidence, fact.attribution))) return TOPIC_TEST_REJECTION_CODES.evidence_attribution_mismatch;
  if (speechAttributed && (normalized(fact.attribution) !== normalized(fact.actor) || !includesExactPhrase(fact.claim, fact.actorPredicate))) return TOPIC_TEST_REJECTION_CODES.evidence_attribution_mismatch;
  if (actorConflict(fact.claim, fact, passage) || !claimSupported(fact.claim, fact, passage)) return TOPIC_TEST_REJECTION_CODES.evidence_unsupported_claim;
  return null;
}

export function diagnoseTopicTestFactEvidence(fact, passage) {
  return factEvidenceRejection(fact, passage);
}

function sourceScopeRanges(passage) {
  const source = String(passage || "");
  const ranges = [];
  let start = 0;
  const closers = new Set(['"', "'", "”", "’", ")", "]", "}"]);
  for (let index = 0; index < source.length; index += 1) {
    if (![".", "!", "?"].includes(source[index])) continue;
    let end = index + 1;
    while (end < source.length && [".", "!", "?"].includes(source[end])) end += 1;
    let look = end;
    while (look < source.length && closers.has(source[look])) look += 1;
    const boundaryEnd = look;
    while (look < source.length && /\s/u.test(source[look])) look += 1;
    const next = source[look] || "";
    if (next && /^\p{Ll}$/u.test(next)) continue;
    let trimmedStart = start; while (trimmedStart < boundaryEnd && /\s/u.test(source[trimmedStart])) trimmedStart += 1;
    let trimmedEnd = boundaryEnd; while (trimmedEnd > trimmedStart && /\s/u.test(source[trimmedEnd - 1])) trimmedEnd -= 1;
    if (trimmedEnd > trimmedStart) ranges.push({ start: trimmedStart, end: trimmedEnd });
    start = boundaryEnd;
  }
  let trimmedStart = start; while (trimmedStart < source.length && /\s/u.test(source[trimmedStart])) trimmedStart += 1;
  let trimmedEnd = source.length; while (trimmedEnd > trimmedStart && /\s/u.test(source[trimmedEnd - 1])) trimmedEnd -= 1;
  if (trimmedEnd > trimmedStart) ranges.push({ start: trimmedStart, end: trimmedEnd });
  return ranges;
}

export function createTopicTestSourceCatalog(passage, limits = TOPIC_TEST_SOURCE_CATALOG_LIMITS) {
  const source = String(passage || "");
  if (source.length > limits.maxSourceChars) return { usable: false, reason: "source_too_large", scopes: [], tokenCount: 0 };
  const ranges = sourceScopeRanges(source);
  if (ranges.length > limits.maxScopes) return { usable: false, reason: "too_many_scopes", scopes: [], tokenCount: 0 };
  let tokenCount = 0;
  const scopes = [];
  for (let scopeIndex = 0; scopeIndex < ranges.length; scopeIndex += 1) {
    const range = ranges[scopeIndex];
    const scopeId = `scope_${String(scopeIndex + 1).padStart(4, "0")}`;
    const text = source.slice(range.start, range.end);
    const matches = [...text.matchAll(/[\p{L}\p{M}\p{N}]+(?:[’'][\p{L}\p{M}\p{N}]+)*|[^\s]/gu)];
    if (matches.length > limits.maxTokensPerScope) return { usable: false, reason: "scope_too_large", scopes: [], tokenCount };
    tokenCount += matches.length;
    if (tokenCount > limits.maxTokens) return { usable: false, reason: "too_many_tokens", scopes: [], tokenCount };
    const tokens = matches.map((match, tokenIndex) => ({
      id: `${scopeId}_t${String(tokenIndex + 1).padStart(4, "0")}`,
      text: match[0],
      start: range.start + match.index,
      end: range.start + match.index + match[0].length,
    }));
    scopes.push({ id: scopeId, start: range.start, end: range.end, text, tokens });
  }
  return { usable: true, reason: null, scopes, tokenCount };
}

function resolveSourceRange(range, expectedScope, scopeById, tokenById) {
  if (!range?.startTokenId || !range?.endTokenId) return { error: "missing" };
  const start = tokenById.get(String(range.startTokenId));
  const end = tokenById.get(String(range.endTokenId));
  if (!start || !end) return { error: "unknown_token" };
  if (start.scopeId !== end.scopeId || start.scopeId !== expectedScope) return { error: "cross_scope" };
  if (start.index > end.index) return { error: "reversed" };
  const scope = scopeById.get(expectedScope);
  return { start: start.start, end: end.end, text: scope.source.slice(start.start, end.end) };
}

export function resolveTopicTestSourceSpans(questions, catalog, passage) {
  const scopeById = new Map();
  const tokenById = new Map();
  for (const scope of Array.isArray(catalog?.scopes) ? catalog.scopes : []) {
    const storedScope = { ...scope, source: String(passage || "") };
    scopeById.set(String(scope.id), storedScope);
    for (let index = 0; index < scope.tokens.length; index += 1) tokenById.set(String(scope.tokens[index].id), { ...scope.tokens[index], index, scopeId: String(scope.id) });
  }
  const errorCode = { missing: "missing_span_fields", unknown_token: "unknown_token", cross_scope: "cross_scope", reversed: "reversed_range" };
  return (Array.isArray(questions) ? questions : []).map((question) => ({
    ...question,
    grounding: question?.grounding && typeof question.grounding === "object" ? {
      ...question.grounding,
      evidenceResolution: Array.isArray(question.grounding.facts) && question.grounding.facts.length > TOPIC_TEST_SOURCE_CATALOG_LIMITS.maxFactsPerQuestion ? "too_many_facts" : undefined,
      facts: Array.isArray(question.grounding.facts) && question.grounding.facts.length <= TOPIC_TEST_SOURCE_CATALOG_LIMITS.maxFactsPerQuestion ? question.grounding.facts.map((fact) => {
        const scopeId = String(fact?.scopeId || "");
        if (!scopeId) return { ...fact, evidence: "", evidenceResolution: "missing_span_fields" };
        const scope = scopeById.get(scopeId);
        if (!scope) return { ...fact, evidence: "", evidenceResolution: "unknown_scope" };
        const actor = resolveSourceRange(fact?.actorSpan, scopeId, scopeById, tokenById);
        const actorPredicate = resolveSourceRange(fact?.actorPredicateSpan, scopeId, scopeById, tokenById);
        const predicate = resolveSourceRange(fact?.predicateSpan, scopeId, scopeById, tokenById);
        const attribution = fact?.attributionSpan ? resolveSourceRange(fact.attributionSpan, scopeId, scopeById, tokenById) : null;
        const failed = [actor, actorPredicate, predicate, attribution].filter(Boolean).find((value) => value.error);
        if (failed) return { ...fact, evidence: "", evidenceResolution: errorCode[failed.error] };
        if (actor.start < actorPredicate.start || actor.end > actorPredicate.end) return { ...fact, evidence: "", evidenceResolution: "actor_outside_actor_predicate" };
        return {
          ...fact,
          evidence: scope.text,
          actor: actor.text,
          actorPredicate: actorPredicate.text,
          predicate: predicate.text,
          attribution: attribution?.text || null,
          evidenceResolution: "resolved_spans",
        };
      }) : [],
    } : question?.grounding,
  }));
}

export function createTopicTestEvidenceExcerpts(passage) {
  const source = String(passage || "");
  const clauses = [...source.matchAll(/[^\r\n.!?]+(?:[.!?]+|(?=\r?\n|$))/gu)]
    .map((match) => ({ start: match.index, end: match.index + match[0].length }))
    .filter(({ start, end }) => source.slice(start, end).trim());
  if (!clauses.length && source.trim()) clauses.push({ start: 0, end: source.length });
  return clauses.map((clause, index) => {
    const start = clauses[Math.max(0, index - 1)].start;
    const end = clauses[Math.min(clauses.length - 1, index + 1)].end;
    return { id: `excerpt_${String(index + 1).padStart(4, "0")}`, text: source.slice(start, end).trim() };
  });
}

export function resolveTopicTestEvidenceExcerpts(questions, excerpts) {
  const byId = new Map((Array.isArray(excerpts) ? excerpts : []).map((excerpt) => [String(excerpt.id), String(excerpt.text)]));
  return (Array.isArray(questions) ? questions : []).map((question) => ({
    ...question,
    grounding: question?.grounding && typeof question.grounding === "object" ? {
      ...question.grounding,
      facts: Array.isArray(question.grounding.facts) ? question.grounding.facts.map((fact) => {
        const excerptId = String(fact?.excerptId || "");
        const evidence = byId.get(excerptId);
        return evidence === undefined
          ? { ...fact, evidence: "", evidenceResolution: "unknown_excerpt" }
          : { ...fact, evidence, evidenceResolution: "resolved" };
      }) : question.grounding.facts,
    } : question?.grounding,
  }));
}
function componentRejection(component, facts, passage) {
  if (!component?.claim?.trim() || !Array.isArray(component.factIds) || !component.factIds.length) return TOPIC_TEST_REJECTION_CODES.missing_grounding;
  if (component.factIds.length > TOPIC_TEST_SOURCE_CATALOG_LIMITS.maxFactsPerQuestion) return TOPIC_TEST_REJECTION_CODES.evidence_catalog_limits;
  const linked = component.factIds.map((id) => facts.get(String(id)));
  if (linked.some((fact) => !fact)) return TOPIC_TEST_REJECTION_CODES.evidence_missing_fields;
  for (const fact of linked) {
    const rejection = factEvidenceRejection(fact, passage);
    if (rejection) return rejection;
  }
  const frames = new Set(linked.map((fact) => fact.frame));
  if (frames.size !== 1 || component.treatment !== linked[0].frame) return TOPIC_TEST_REJECTION_CODES.framing_mismatch;
  if (actorConflictAcrossFacts(component.claim, linked, passage)) return TOPIC_TEST_REJECTION_CODES.actor_conflict;
  if (!claimSupportedByFacts(component.claim, linked, passage)) return TOPIC_TEST_REJECTION_CODES.unsupported_claim;
  const frame = linked[0].frame;
  if ((frame === "negation" && !NEGATION.test(component.claim)) || (frame === "comparison" && !hasComparison(component.claim)) || (frame === "belief" && !hasBelief(component.claim)) || (frame === "hypothetical" && !hasHypothetical(component.claim))) return TOPIC_TEST_REJECTION_CODES.framing_mismatch;
  if (frame === "belief" && !linked.every((fact) => includesExactPhrase(component.claim, fact.attribution))) return TOPIC_TEST_REJECTION_CODES.framing_mismatch;
  if (linked.some((fact) => SPEECH_ATTRIBUTION.test(String(fact.actorPredicate || "")) && (!SPEECH_ATTRIBUTION.test(String(component.claim || "")) || !includesExactPhrase(component.claim, fact.attribution)))) return TOPIC_TEST_REJECTION_CODES.framing_mismatch;
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
  if (actorConflictAcrossFacts(displayed, linked, passage)) return TOPIC_TEST_REJECTION_CODES.actor_conflict;
  if (sharesScript && !claimSupportedByFacts(displayed, linked, passage)) return TOPIC_TEST_REJECTION_CODES.displayed_content_mismatch;
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
    if (!rejection && grounding?.evidenceResolution === "too_many_facts") rejection = TOPIC_TEST_REJECTION_CODES.evidence_catalog_limits;
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

function boundedNonempty(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export function validatePassageTopicTestCandidates(candidates, knownReferenceIds) {
  const known = new Set(Array.from(knownReferenceIds || [], String));
  const accepted = [], rejected = [], ids = new Set(), questions = new Set();
  for (const raw of Array.isArray(candidates) ? candidates : []) {
    const id = String(raw?.id || "").trim();
    const question = String(raw?.question || "").trim();
    const options = Array.isArray(raw?.options) ? raw.options.map((value) => String(value || "").trim()) : [];
    const explanation = String(raw?.explanation || "").trim();
    const references = Array.isArray(raw?.sourceReferences) ? raw.sourceReferences.map(String) : [];
    const signature = topicTestQuestionSignature(question);
    let reason = null;
    if (typeof raw?.id !== "string" || !boundedNonempty(id, TOPIC_TEST_REVIEW_LIMITS.candidateId) || ids.has(id)) reason = "invalid_or_duplicate_id";
    else if (!boundedNonempty(question, TOPIC_TEST_REVIEW_LIMITS.question) || !signature || questions.has(signature)) reason = "invalid_or_duplicate_question";
    else if (options.length !== 4 || options.some((value) => !boundedNonempty(value, TOPIC_TEST_REVIEW_LIMITS.option)) || new Set(options.map(normalized)).size !== 4) reason = "invalid_options";
    else if (!Number.isInteger(raw?.correctIndex) || raw.correctIndex < 0 || raw.correctIndex > 3) reason = "invalid_correct_index";
    else if (!boundedNonempty(explanation, TOPIC_TEST_REVIEW_LIMITS.explanation)) reason = "invalid_explanation";
    else if (!references.length || references.length > TOPIC_TEST_REVIEW_LIMITS.references || new Set(references).size !== references.length || references.some((ref) => !known.has(ref))) reason = "invalid_source_references";
    if (reason) rejected.push({ id, reason });
    else {
      ids.add(id); questions.add(signature);
      accepted.push({ id, question, options, correctIndex: raw.correctIndex, explanation, sourceReferences: references });
    }
  }
  return { accepted, rejected };
}

export function validatePassageTopicTestReviews(reviews, candidates, knownReferenceIds) {
  const source = validatePassageTopicTestCandidates(candidates, knownReferenceIds).accepted;
  const byId = new Map(source.map((candidate) => [candidate.id, candidate]));
  const knownReasons = new Set(TOPIC_TEST_REVIEW_REASON_CODES);
  const accepted = [], rejected = [], seen = new Set();
  for (const review of Array.isArray(reviews) ? reviews : []) {
    const id = String(review?.id || "").trim();
    if (!byId.has(id) || seen.has(id)) { rejected.push({ id, reason: "unknown_or_duplicate_review_id" }); continue; }
    seen.add(id);
    const decision = review?.decision;
    const reasonCode = String(review?.reasonCode || "");
    if ((decision !== "accept" && decision !== "reject") || !knownReasons.has(reasonCode)) { rejected.push({ id, reason: "malformed_review" }); continue; }
    if (decision === "reject") { rejected.push({ id, reason: reasonCode }); continue; }
    const complete = validatePassageTopicTestCandidates([review?.candidate], knownReferenceIds).accepted[0];
    if (!complete || complete.id !== id || reasonCode !== "accepted") { rejected.push({ id, reason: "malformed_corrected_candidate" }); continue; }
    accepted.push(complete);
  }
  for (const id of byId.keys()) if (!seen.has(id)) rejected.push({ id, reason: "missing_review_id" });
  const protocolErrors = new Set(["unknown_or_duplicate_review_id", "malformed_review", "malformed_corrected_candidate", "missing_review_id"]);
  return { accepted, rejected, complete: seen.size === byId.size && !rejected.some((item) => protocolErrors.has(item.reason)) };
}
export function scoreTopicTest(questions, answers) {
  const valid = selectValidDistinctTopicQuestions(questions, Number.MAX_SAFE_INTEGER);
  const correct = valid.reduce((total, question) => total + (answers?.[question.id] === question.correctIndex ? 1 : 0), 0);
  return { correct, total: valid.length, percent: valid.length ? Math.round((correct / valid.length) * 100) : 0 };
}
