type CompetitiveQaContext = {
  subject?: string | null;
  topic?: string | null;
  exam?: string | null;
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
    .replace(/[ \t]+\n/g, "\n")
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

    if (/answer|correct option/i.test(line)) {
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

function replacementMcq(ctx: CompetitiveQaContext, sequence: number) {
  const topic = String(ctx.topic || "this topic").trim();
  const exam = String(ctx.exam || "competitive exam").trim();
  const focus = [
    "core concept",
    "formula selection",
    "trap elimination",
    "application step",
    "final verification",
  ][sequence % 5];

  return [
    `**${sequence}.** In ${topic}, what should you verify first while solving a ${exam} MCQ on ${focus}?`,
    "- A) The concept used, the given data, and the final option",
    "- B) Only the longest option",
    "- C) Only the first formula remembered",
    "- D) Only the option that looks familiar",
    "- **Answer:** A) The concept used, the given data, and the final option",
    "- **Explanation:** Option A is correct because competitive MCQs need concept check, data check, and answer-option verification. The other options are common traps.",
  ].join("\n");
}

function repairMcqBlock(block: string, ctx: CompetitiveQaContext, sequence: number) {
  const parsed = parseMcqBlock(block);
  if (!parsed) return block;

  let answerIndex = answerIndexFromLine(parsed.answerLine);
  if (answerIndex < 0 || answerIndex > 3) return replacementMcq(ctx, sequence);

  const finalNumber = finalExplanationNumber(`${parsed.answerLine}\n${parsed.explanation}`);
  if (finalNumber !== null) {
    const optionMatches = parsed.options
      .map((option, index) => ({
        index,
        matches: extractNumbers(option).some((num) => sameNumber(num, finalNumber)),
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

export function qaRepairCompetitiveText(input: string, ctx: CompetitiveQaContext = {}) {
  const safe = sanitizePdfSafeText(input);
  const blocks = safe.split(/(?=^\s*(?:\*\*)?\d+[\).]\s+)/gm);
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

export { sanitizePdfSafeText };
