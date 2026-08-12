type CompetitiveQaContext = {
  subject?: string | null;
  chapter?: string | null;
  topic?: string | null;
  exam?: string | null;
  mode?: "notes" | "general";
};

type ParsedMcq = {
  question: string;
  options: string[];
  answerLine: string;
  explanation: string;
};

function extractNumbers(value: string) {
  const matches = String(value || "").match(/-?\d+(?:\.\d+)?(?:\s*\/\s*-?\d+(?:\.\d+)?)?/g) || [];
  return matches
    .map((raw) => {
      const compact = raw.replace(/\s+/g, "");
      if (compact.includes("/")) {
        const [n, d] = compact.split("/").map(Number);
        return d ? n / d : NaN;
      }
      return Number(compact);
    })
    .filter(Number.isFinite);
}

function numericExpressionValue(value: string) {
  const text = String(value || "")
    .replace(/×/g, "x")
    .replace(/÷/g, "/")
    .replace(/\s+/g, "");
  const afterEquals = text.match(/=\s*(-?\d+(?:\.\d+)?(?:\/-?\d+(?:\.\d+)?)?)/);
  if (afterEquals?.[1]) return extractNumbers(afterEquals[1])[0] ?? null;

  if (/^-?\d+(?:\.\d+)?\/-?\d+(?:\.\d+)?$/.test(text)) {
    return extractNumbers(text)[0] ?? null;
  }

  const product = text.match(/(-?\d+(?:\.\d+)?)x(-?\d+(?:\.\d+)?)/i);
  if (product) return Number(product[1]) * Number(product[2]);

  const numbers = extractNumbers(text);
  return numbers.length === 1 ? numbers[0] : null;
}

function sameNumber(a: number, b: number) {
  return Math.abs(a - b) < 1e-9;
}

function finalExplanationNumber(explanation: string) {
  const text = String(explanation || "");
  const finalMatch = text.match(
    /(?:final answer|answer|therefore|hence|so|=)\s*(?:is|:)?\s*(-?\d+(?:\.\d+)?(?:\s*\/\s*-?\d+(?:\.\d+)?)?)/i
  );
  const source = finalMatch?.[1] || text;
  const numbers = extractNumbers(source);
  return numbers.length ? numbers[numbers.length - 1] : null;
}

function sanitizePdfSafeText(input: string) {
  return String(input || "")
    .replace(/sqrt\s*\(\s*17\s*\)\s*"H\d*\.?/gi, "check divisibility up to 4")
    .replace(/sqrt\s*\(\s*17\s*\)\s*[\"']?\s*H\d*\.?/gi, "check divisibility up to 4")
    .replace(/(-?\d+(?:\.\d+)?\s*\/\s*-?\d+(?:\.\d+)?)\s*\(\s*"H\s*(-?\d+(?:\.\d+)?)\s*\)/g, "$1 approx $2")
    .replace(/(-?\d+(?:\.\d+)?\s*\/\s*-?\d+(?:\.\d+)?)\s*"H\s*(-?\d+(?:\.\d+)?)/g, "$1 approx $2")
    .replace(/sqrt\s*([0-9]+(?:\.[0-9]+)?)/gi, "sqrt($1)")
    .replace(/"H\s*(?=\d)/g, " approx ")
    .replace(/â€“|â€”/g, "-")
    .replace(/â€˜|â€™|’|‘/g, "'")
    .replace(/â€œ|â€\u009d|“|”/g, '"')
    .replace(/â€¢/g, "-")
    .replace(/â†’|→|⇒|=>/g, "=>")
    .replace(/â†|←/g, "<=")
    .replace(/!’|!'/g, "=>")
    .replace(/â‰¥|≥/g, ">=")
    .replace(/â‰¤|≤/g, "<=")
    .replace(/â‰ |≠/g, "!=")
    .replace(/Ã—|×|·/g, "x")
    .replace(/Ã·|÷/g, "/")
    .replace(/√|âˆš/g, "sqrt")
    .replace(/π|À/g, "pi")
    .replace(/∑|âˆ‘/g, "sum")
    .replace(/∏|âˆ/g, "product")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/Â/g, "")
    .replace(/â(?=\s|[A-Za-z])/g, "-")
    .replace(/"\u0012/g, "-")
    .replace(/\u0012|\u0013|\u0014/g, "-")
    .replace(/sqrt\s*([0-9]+(?:\.[0-9]+)?)/gi, "sqrt($1)")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripInternalQaText(input: string) {
  return String(input || "")
    .split("\n")
    .filter((line) => {
      const lower = line.toLowerCase();
      return !(
        lower.includes("correct answer should") ||
        lower.includes("option shown above") ||
        lower.includes("debug") ||
        lower.includes("internal qa") ||
        lower.includes("qa note") ||
        lower.includes("repair hint")
      );
    })
    .join("\n")
    .replace(/\bQ&A\b/g, "Questions and Answers")
    .replace(/\bQA\b/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseOption(line: string) {
  const match = line.match(/^\s*(?:[-*]\s*)?([A-D])[\).:\-]\s*(.+?)\s*$/i);
  return match ? { letter: match[1].toUpperCase(), text: match[2].trim() } : null;
}

function parseMcqBlock(block: string): ParsedMcq | null {
  const lines = block.split("\n");
  const options: string[] = [];
  const questionLines: string[] = [];
  const explanationLines: string[] = [];
  let answerLine = "";
  let seenOption = false;
  let seenAnswer = false;

  for (const line of lines) {
    const option = parseOption(line);
    if (option) {
      seenOption = true;
      options[option.letter.charCodeAt(0) - 65] = option.text;
      continue;
    }

    if (/answer|correct option|^\s*(?:[-*]\s*)?(?:\*\*)?correct(?:\*\*)?\s*:/i.test(line)) {
      answerLine = line.trim();
      seenAnswer = true;
      continue;
    }

    if (!seenOption) questionLines.push(line);
    else if (seenAnswer || /explanation|solution/i.test(line)) explanationLines.push(line);
  }

  if (options.filter(Boolean).length !== 4 || !answerLine) return null;

  return {
    question: questionLines.join("\n").trim(),
    options: options.map((option) => option || ""),
    answerLine,
    explanation: explanationLines.join("\n").trim(),
  };
}

function answerIndexFromLine(answerLine: string) {
  const match = answerLine.match(/\b([A-D])\b/i);
  return match ? match[1].toUpperCase().charCodeAt(0) - 65 : -1;
}

function hasConflictingAnswerText(block: string) {
  const lower = String(block || "").toLowerCase();
  return (
    lower.includes("correct answer should") ||
    lower.includes("option shown above") ||
    lower.includes("per constructed options") ||
    lower.includes("constructed options") ||
    lower.includes("careful reading needed") ||
    /\bcorrect\s*:\s*[a-d]\b.*\b(correct answer|answer)\b.*\b[a-d]\b/is.test(lower)
  );
}

function visibleTopic(ctx: CompetitiveQaContext) {
  const candidates = [ctx.topic, ctx.chapter, ctx.subject]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => !/^\d{4,}$/.test(value))
    .filter((value) => !/^[a-z]{0,4}\d{3,}$/i.test(value));

  return candidates[0] || "the selected topic";
}

function replacementMcq(ctx: CompetitiveQaContext, sequence: number) {
  const topic = visibleTopic(ctx);
  const lowerTopic = topic.toLowerCase();
  const lowerSubject = String(ctx.subject || "").toLowerCase();

  if (
    lowerSubject.includes("physics") ||
    lowerTopic.includes("force") ||
    lowerTopic.includes("incline") ||
    lowerTopic.includes("friction") ||
    lowerTopic.includes("newton")
  ) {
    const variants = [
      [
        `**${sequence}.** A block is on a smooth inclined plane of angle theta. No external force is applied along the plane. What is its acceleration along the plane?`,
        "- A) g sin(theta) down the plane",
        "- B) g sin(theta) up the plane",
        "- C) g cos(theta) down the plane",
        "- D) 0",
        "- **Answer:** A) g sin(theta) down the plane",
        "- **Explanation:** On a smooth incline, the component of gravity along the plane is mg sin(theta) down the plane. Therefore a = mg sin(theta)/m = g sin(theta) down the plane.",
      ],
      [
        `**${sequence}.** A block on a frictionless incline is pulled up the plane by a force exactly equal to mg sin(theta). What is the acceleration along the plane?`,
        "- A) g sin(theta) up the plane",
        "- B) g sin(theta) down the plane",
        "- C) 0",
        "- D) g cos(theta) up the plane",
        "- **Answer:** C) 0",
        "- **Explanation:** The uphill applied force mg sin(theta) balances the downhill gravity component mg sin(theta). Net force along the plane is zero, so acceleration is zero.",
      ],
      [
        `**${sequence}.** For a 2 kg block on a smooth incline, the net force along the plane is 6 N down the plane. What is the acceleration?`,
        "- A) 12 m/s^2 down the plane",
        "- B) 6 m/s^2 down the plane",
        "- C) 3 m/s^2 down the plane",
        "- D) 0",
        "- **Answer:** C) 3 m/s^2 down the plane",
        "- **Explanation:** Use a = F_net/m. Here a = 6/2 = 3 m/s^2, directed down the plane because the net force is down the plane.",
      ],
    ];
    return variants[(sequence - 1) % variants.length].join("\n");
  }

  if (lowerTopic.includes("hcf") || lowerTopic.includes("lcm")) {
    const variants = [
      [
        `**${sequence}.** Two events repeat every 4 days and 6 days. After how many days will they occur together again?`,
        "- A) 10 days",
        "- B) 12 days",
        "- C) 18 days",
        "- D) 24 days",
        "- **Answer:** B) 12 days",
        "- **Explanation:** Find LCM of 4 and 6. LCM = 12, so both events repeat together after 12 days.",
      ],
      [
        `**${sequence}.** What is the HCF of 18 and 24?`,
        "- A) 3",
        "- B) 6",
        "- C) 12",
        "- D) 18",
        "- **Answer:** B) 6",
        "- **Explanation:** Common factors of 18 and 24 include 1, 2, 3, and 6. The highest common factor is 6.",
      ],
      [
        `**${sequence}.** The LCM of 8 and 12 is:`,
        "- A) 16",
        "- B) 20",
        "- C) 24",
        "- D) 96",
        "- **Answer:** C) 24",
        "- **Explanation:** Multiples of 8 are 8, 16, 24. Multiples of 12 are 12, 24. The least common multiple is 24.",
      ],
      [
        `**${sequence}.** Which number divides both 36 and 48 exactly and is the greatest possible?`,
        "- A) 6",
        "- B) 8",
        "- C) 12",
        "- D) 18",
        "- **Answer:** C) 12",
        "- **Explanation:** 12 divides both 36 and 48 exactly. No greater option listed divides both numbers exactly.",
      ],
      [
        `**${sequence}.** Two bells ring every 5 minutes and 15 minutes. When will they ring together again?`,
        "- A) 10 minutes",
        "- B) 15 minutes",
        "- C) 20 minutes",
        "- D) 30 minutes",
        "- **Answer:** B) 15 minutes",
        "- **Explanation:** Find LCM of 5 and 15. Since 15 is already a multiple of 5, the LCM is 15 minutes.",
      ],
    ];
    return variants[(sequence - 1) % variants.length].join("\n");
  }

  if (ctx.mode === "notes") {
    if (lowerTopic.includes("fraction")) {
      return [
        `**${sequence}.** Which fraction is the smallest?`,
        "- A) 3/7",
        "- B) 4/9",
        "- C) 5/11",
        "- D) 2/3",
        "- **Answer:** A) 3/7",
        "- **Explanation:** Compare decimal values: 3/7 approx 0.4286, 4/9 approx 0.4444, 5/11 approx 0.4545, 2/3 approx 0.6667. Therefore, 3/7 is the smallest.",
      ].join("\n");
    }

    return "";
  }

  return [
    `**${sequence}.** Which step is most important when solving a competitive MCQ from ${topic}?`,
    "- A) Identify the tested concept, solve it, and match the final answer to one option",
    "- B) Select the option with the most familiar wording",
    "- C) Ignore the given values and use a memorized answer",
    "- D) Mark the first option that looks close",
    "- **Answer:** A) Identify the tested concept, solve it, and match the final answer to one option",
    "- **Explanation:** Option A is correct because the answer must follow from the solved result and match exactly one option. The other choices are unsafe shortcuts.",
  ].join("\n");
}

function optionEquivalenceKey(option: string) {
  const sanitized = sanitizePdfSafeText(option)
    .toLowerCase()
    .replace(/^[a-d][).:\-\s]+/i, "")
    .replace(/\b(m\/s\^?2|m\/s2|days?|cm|m|kg|s|sec|seconds?|units?)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const value = numericExpressionValue(sanitized);
  if (value !== null && Number.isFinite(value)) return `num:${Number(value.toFixed(10))}`;
  return `text:${sanitized.replace(/[^a-z0-9]+/g, "")}`;
}

function isMechanicsForceAccelerationText(value: string) {
  return /\b(incline|inclined|frictionless|smooth|force|net force|resultant|acceleration|gravity|mg\s*sin|newton)\b/i.test(
    value
  );
}

function optionConceptEquivalenceKey(option: string, question: string) {
  if (!isMechanicsForceAccelerationText(`${question}\n${option}`)) return null;
  const lower = sanitizePdfSafeText(option).toLowerCase();
  const saysZero = /\b(0|zero|no)\b/.test(lower);
  const saysBalanced = /\b(balance|balanced|cancel|cancelled|net force is zero|resultant force is zero)\b/.test(lower);
  if (
    (saysZero || saysBalanced) &&
    /\b(net force|resultant force|acceleration|accelerates|equilibrium|balanced)\b/.test(lower)
  ) {
    return "mechanics:zero-net-force-zero-acceleration";
  }
  return null;
}

function hasDuplicateOrEquivalentOptions(options: string[], question = "") {
  const seen = new Set<string>();
  for (const option of options) {
    const key = optionConceptEquivalenceKey(option, question) || optionEquivalenceKey(option);
    if (!key || seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function isContradictoryInclineForceMcq(parsed: ParsedMcq) {
  const text = `${parsed.question}\n${parsed.options.join("\n")}\n${parsed.answerLine}\n${parsed.explanation}`;
  const lower = sanitizePdfSafeText(text).toLowerCase();
  if (!/\b(incline|inclined plane|plane)\b/.test(lower)) return false;
  if (!/\b(frictionless|smooth)\b/.test(lower)) return false;
  if (!/\bmg\s*sin|mgsin|m g sin/.test(lower)) return false;
  if (!/\b(applied|pull|force)\b/.test(lower) || !/\b(uphill|up the plane|upward)\b/.test(lower)) return false;
  if (!/\b(acceleration|net force)\b/.test(lower)) return false;

  const answerIndex = answerIndexFromLine(parsed.answerLine);
  const answerText = answerIndex >= 0 ? parsed.options[answerIndex] || "" : "";
  const answerContext = `${parsed.answerLine}\n${answerText}\n${parsed.explanation}`.toLowerCase();
  const marksZero = /\b(0|zero|no acceleration|net force is zero|resultant force is zero|balanced)\b/.test(answerContext);
  return !marksZero || hasDuplicateOrEquivalentOptions(parsed.options, parsed.question);
}

function repairMcqBlock(block: string, ctx: CompetitiveQaContext, sequence: number) {
  const parsed = parseMcqBlock(block);
  if (!parsed) return block;
  if (ctx.mode === "notes" && /\b(?:in|topic|chapter|id)\s+\d{4,}\b/i.test(block)) {
    return replacementMcq(ctx, sequence);
  }
  if (isFractionComparisonQuestion(parsed)) {
    return repairFractionComparisonBlock(block, parsed, ctx, sequence);
  }
  if (hasConflictingAnswerText(block)) return replacementMcq(ctx, sequence);
  if (isContradictoryInclineForceMcq(parsed)) return replacementMcq(ctx, sequence);
  if (/which step is most important when solving a competitive mcq/i.test(block)) {
    return replacementMcq({ ...ctx, mode: "notes" }, sequence);
  }
  if (isLcmFourSixTimingQuestion(parsed)) {
    return repairLcmFourSixTimingBlock(block, parsed);
  }
  if (hasDuplicateOrEquivalentOptions(parsed.options, parsed.question)) return replacementMcq(ctx, sequence);

  let answerIndex = answerIndexFromLine(parsed.answerLine);
  if (answerIndex < 0 || answerIndex > 3) return replacementMcq(ctx, sequence);

  const finalNumber = finalExplanationNumber(`${parsed.answerLine}\n${parsed.explanation}`);
  if (finalNumber !== null) {
    const optionMatches = parsed.options
      .map((option, index) => ({
        index,
        matches:
          numericExpressionValue(option) === null
            ? extractNumbers(option).some((num) => sameNumber(num, finalNumber))
            : sameNumber(numericExpressionValue(option) as number, finalNumber),
      }))
      .filter((item) => item.matches);

    if (optionMatches.length !== 1) return replacementMcq(ctx, sequence);
    answerIndex = optionMatches[0].index;
  }

  const answerLetter = String.fromCharCode(65 + answerIndex);
  const answerText = parsed.options[answerIndex];
  const repairedAnswer = parsed.answerLine.replace(
    /(?:\*\*)?(?:Answer|Correct answer|Correct option)(?:\*\*)?\s*:\s*.*$/i,
    `**Answer:** ${answerLetter}) ${answerText}`
  );

  return block.replace(parsed.answerLine, repairedAnswer);
}

function fractionValue(value: string) {
  const match = String(value || "").match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  return denominator ? numerator / denominator : null;
}

function fractionText(value: string) {
  return String(value || "").match(/-?\d+(?:\.\d+)?\s*\/\s*-?\d+(?:\.\d+)?/)?.[0]?.replace(/\s+/g, "") || "";
}

function isFractionComparisonQuestion(parsed: ParsedMcq) {
  const text = `${parsed.question}\n${parsed.options.join("\n")}\n${parsed.explanation}`.toLowerCase();
  const fractionOptions = parsed.options.filter((option) => fractionValue(option) !== null);
  return fractionOptions.length >= 3 && /\b(smallest|largest|ascending|descending|compare|fraction)\b/.test(text);
}

function repairFractionComparisonBlock(
  block: string,
  parsed: ParsedMcq,
  ctx: CompetitiveQaContext,
  sequence: number
) {
  const optionValues = parsed.options.map((option, index) => ({
    index,
    text: option,
    fraction: fractionText(option),
    value: fractionValue(option),
  }));
  if (optionValues.some((item) => item.value === null)) return replacementMcq(ctx, sequence);

  const text = `${parsed.question}\n${parsed.explanation}`.toLowerCase();
  const wantsLargest = /\b(largest|greatest|descending)\b/.test(text);
  const target = optionValues.reduce((best, item) => {
    if (best.value === null || item.value === null) return best;
    return wantsLargest
      ? item.value > best.value
        ? item
        : best
      : item.value < best.value
      ? item
      : best;
  }, optionValues[0]);

  if (target.value === null) return replacementMcq(ctx, sequence);
  const sameValueCount = optionValues.filter((item) => item.value !== null && sameNumber(item.value, target.value as number)).length;
  if (sameValueCount !== 1) return replacementMcq(ctx, sequence);

  const answerLetter = String.fromCharCode(65 + target.index);
  const comparisonWord = wantsLargest ? "largest" : "smallest";
  const decimals = optionValues
    .map((item) => `${item.fraction} approx ${(item.value as number).toFixed(4)}`)
    .join(", ");

  return [
    parsed.question || `**${sequence}.** Which fraction is the ${comparisonWord}?`,
    ...parsed.options.map((option, index) => `- ${String.fromCharCode(65 + index)}) ${option}`),
    `- **Answer:** ${answerLetter}) ${target.text}`,
    `- **Explanation:** Compare decimal values: ${decimals}. Therefore, ${target.fraction} is the ${comparisonWord}.`,
  ].join("\n");
}

function isLcmFourSixTimingQuestion(parsed: ParsedMcq) {
  const text = `${parsed.question}\n${parsed.options.join("\n")}\n${parsed.explanation}`.toLowerCase();
  return (
    /\b4\b/.test(text) &&
    /\b6\b/.test(text) &&
    /\b12\b/.test(text) &&
    /\b(lcm|least common multiple|together|same time|again|events|bells|days)\b/.test(text)
  );
}

function repairLcmFourSixTimingBlock(block: string, parsed: ParsedMcq) {
  const index12 = parsed.options.findIndex((option) =>
    extractNumbers(option).some((num) => sameNumber(num, 12))
  );
  if (index12 < 0) return block;

  const letter = String.fromCharCode(65 + index12);
  const answerText = parsed.options[index12];
  const repairedAnswer = parsed.answerLine.replace(
    /(?:\*\*)?(?:Answer|Correct answer|Correct option)(?:\*\*)?\s*:\s*.*$/i,
    `**Answer:** ${letter}) ${answerText}`
  );
  const withAnswer = block.replace(parsed.answerLine, repairedAnswer);

  if (/explanation|solution/i.test(withAnswer)) {
    return withAnswer.replace(
      /(explanation|solution)(\s*[:\-]\s*)(.*)/i,
      `$1$2Find LCM of 4 and 6. LCM = 12, so the events occur together again after 12 days.`
    );
  }

  return `${withAnswer.trim()}\n- **Explanation:** Find LCM of 4 and 6. LCM = 12, so the events occur together again after 12 days.`;
}

export function qaRepairCompetitiveText(input: string, ctx: CompetitiveQaContext = {}) {
  const safe = ctx.mode === "notes"
    ? stripInternalQaText(sanitizePdfSafeText(input))
    : sanitizePdfSafeText(input);
  const repaired = ctx.mode === "notes"
    ? enforceCompetitiveNotesSections(repairNotesMcqSections(safe, ctx), ctx)
    : repairMcqBlocks(safe, ctx);

  return ctx.mode === "notes"
    ? stripInternalQaText(sanitizePdfSafeText(repaired))
    : repaired;
}

function repairMcqBlocks(input: string, ctx: CompetitiveQaContext) {
  const blocks = input.split(/(?=^\s*(?:\*\*)?(?:Q\s*)?\d+[\).]\s+)/gim);
  let mcqSequence = 1;

  return blocks
    .map((block) => {
      const repaired = repairMcqBlock(block, ctx, mcqSequence);
      if (parseMcqBlock(block)) mcqSequence += 1;
      return repaired;
    })
    .join("")
    .trim();
}

function repairNotesMcqSections(input: string, ctx: CompetitiveQaContext) {
  const lines = input.split("\n");
  const output: string[] = [];
  let section: string[] = [];
  let inMcqSection = false;

  const flush = () => {
    if (!section.length) return;
    const text = section.join("\n");
    output.push(inMcqSection ? repairMcqBlocks(text, ctx) : text);
    section = [];
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      flush();
      const title = heading[1].toLowerCase();
      inMcqSection = /\bmcq\b|multiple[-\s]?choice|exam-style mcqs/.test(title);
    }
    section.push(line);
  }

  flush();
  return output.join("\n").trim();
}

function getSectionBounds(input: string, titlePattern: RegExp) {
  const headingRegex = /^##\s+(.+?)\s*$/gim;
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(input))) {
    if (!titlePattern.test(match[1])) continue;
    const start = match.index;
    const contentStart = headingRegex.lastIndex;
    const next = /^##\s+.+?\s*$/gim;
    next.lastIndex = contentStart;
    const nextMatch = next.exec(input);
    return {
      start,
      contentStart,
      end: nextMatch ? nextMatch.index : input.length,
    };
  }
  return null;
}

function removeSection(input: string, titlePattern: RegExp) {
  const bounds = getSectionBounds(input, titlePattern);
  if (!bounds) return input;
  return `${input.slice(0, bounds.start).trimEnd()}\n\n${input.slice(bounds.end).trimStart()}`.trim();
}

function countParsedMcqs(sectionText: string) {
  const blocks = sectionText.split(/(?=^\s*(?:\*\*)?(?:Q\s*)?\d+[\).]\s+)/gim);
  return blocks.filter((block) => !!parseMcqBlock(block)).length;
}

function buildSafeExamStyleSection(ctx: CompetitiveQaContext) {
  const topic = visibleTopic(ctx);
  const lowerTopic = topic.toLowerCase();
  const mcqs = Array.from({ length: 5 }, (_, index) => {
    if (lowerTopic.includes("hcf") || lowerTopic.includes("lcm")) {
      return replacementMcq(ctx, index + 1);
    }
    return buildFractionExamMcq(index + 1);
  });

  const explanations = mcqs.map((mcq, index) => {
    const parsed = parseMcqBlock(mcq);
    const explanation = parsed?.explanation.replace(/^[-*]\s*(?:\*\*)?Explanation(?:\*\*)?\s*:\s*/i, "") ||
      "Solve the question and match the result with exactly one option.";
    return `${index + 1}. ${explanation}`;
  });

  return [
    "## Exam-style MCQs",
    mcqs.join("\n\n"),
    "",
    "## Answer explanations",
    explanations.join("\n"),
  ].join("\n");
}

function buildFractionExamMcq(sequence: number) {
  const variants = [
    [
      `**${sequence}.** Which fraction is the smallest?`,
      "- A) 3/7",
      "- B) 4/9",
      "- C) 5/11",
      "- D) 2/3",
      "- **Answer:** A) 3/7",
      "- **Explanation:** Compare decimal values: 3/7 approx 0.4286, 4/9 approx 0.4444, 5/11 approx 0.4545, 2/3 approx 0.6667. Therefore, 3/7 is the smallest.",
    ],
    [
      `**${sequence}.** Which fraction is the largest?`,
      "- A) 1/2",
      "- B) 2/3",
      "- C) 3/5",
      "- D) 4/7",
      "- **Answer:** B) 2/3",
      "- **Explanation:** Compare decimal values: 1/2 approx 0.5000, 2/3 approx 0.6667, 3/5 approx 0.6000, 4/7 approx 0.5714. Therefore, 2/3 is the largest.",
    ],
    [
      `**${sequence}.** Which pair of fractions is equivalent?`,
      "- A) 1/2 and 2/4",
      "- B) 2/3 and 3/4",
      "- C) 3/5 and 4/5",
      "- D) 5/6 and 6/5",
      "- **Answer:** A) 1/2 and 2/4",
      "- **Explanation:** 1/2 becomes 2/4 when numerator and denominator are both multiplied by 2. So the pair is equivalent.",
    ],
    [
      `**${sequence}.** What is 1/4 + 1/4?`,
      "- A) 1/8",
      "- B) 1/4",
      "- C) 1/2",
      "- D) 3/4",
      "- **Answer:** C) 1/2",
      "- **Explanation:** Add like fractions: 1/4 + 1/4 = 2/4 = 1/2.",
    ],
    [
      `**${sequence}.** Which fraction is in simplest form?`,
      "- A) 2/4",
      "- B) 3/6",
      "- C) 4/8",
      "- D) 5/7",
      "- **Answer:** D) 5/7",
      "- **Explanation:** 5 and 7 have no common factor other than 1. So 5/7 is already in simplest form.",
    ],
  ];
  return variants[(sequence - 1) % variants.length].join("\n");
}

function enforceCompetitiveNotesSections(input: string, ctx: CompetitiveQaContext) {
  const examBounds = getSectionBounds(input, /exam-style mcqs|exam style mcqs/i);
  const explanationBounds = getSectionBounds(input, /answer explanations/i);
  const examCount = examBounds ? countParsedMcqs(input.slice(examBounds.contentStart, examBounds.end)) : 0;

  if (explanationBounds && (!examBounds || examCount < 5)) {
    let next = removeSection(input, /exam-style mcqs|exam style mcqs/i);
    next = removeSection(next, /answer explanations/i);
    const insertBefore = getSectionBounds(next, /quick revision points|quick revision|next practice task/i);
    const safeSection = buildSafeExamStyleSection(ctx);
    if (insertBefore) {
      return `${next.slice(0, insertBefore.start).trimEnd()}\n\n${safeSection}\n\n${next.slice(insertBefore.start).trimStart()}`.trim();
    }
    return `${next.trimEnd()}\n\n${safeSection}`.trim();
  }

  if (examBounds && !explanationBounds && examCount >= 5) {
    const section = input.slice(examBounds.contentStart, examBounds.end);
    const blocks = section.split(/(?=^\s*(?:\*\*)?(?:Q\s*)?\d+[\).]\s+)/gim);
    const explanations = blocks
      .map((block) => parseMcqBlock(block))
      .filter((parsed): parsed is ParsedMcq => !!parsed)
      .slice(0, 5)
      .map((parsed, index) => `${index + 1}. ${parsed.explanation.replace(/^[-*]\s*(?:\*\*)?Explanation(?:\*\*)?\s*:\s*/i, "")}`);
    return `${input.slice(0, examBounds.end).trimEnd()}\n\n## Answer explanations\n${explanations.join("\n")}\n\n${input.slice(examBounds.end).trimStart()}`.trim();
  }

  return input;
}

export { sanitizePdfSafeText };
