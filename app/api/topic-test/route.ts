// app/api/topic-test/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { OwnershipError, ownershipErrorResponse, requireStudentMobile } from "@/lib/auth/ownership";
import { readJsonResponse } from "@/app/lib/safeResponse";
import {
  buildCompetitiveJsonQuestionInstruction,
  competitiveExamLabel,
  isCompetitiveMode,
} from "@/app/lib/competitivePrompt";
import { sanitizePdfSafeText } from "@/app/lib/competitiveQa";

export const dynamic = "force-dynamic";

type TopicTestQuestion = {
  id: number;
  difficulty?: "Easy" | "Moderate" | "Hard" | string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

type CompetitiveFallbackContext = {
  subject: string;
  chapter: string;
  topic: string;
  classLevel: string;
  exam: string;
};

const COMPETITIVE_TOPIC_TEST_COUNT = 5;
const COMPETITIVE_DIFFICULTY_MIX: Array<"Easy" | "Moderate" | "Hard"> = [
  "Easy",
  "Easy",
  "Moderate",
  "Moderate",
  "Hard",
];

function normalizeOptionText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/^[a-d][).:\-\s]+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNumbers(value: string) {
  const matches = String(value || "").match(/-?\d+(?:\.\d+)?(?:\s*\/\s*-?\d+(?:\.\d+)?)?/g) || [];
  return matches.map((raw) => {
    const compact = raw.replace(/\s+/g, "");
    if (compact.includes("/")) {
      const [n, d] = compact.split("/").map(Number);
      return d ? n / d : NaN;
    }
    return Number(compact);
  }).filter(Number.isFinite);
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

function extractFinalExplanationNumber(explanation: string) {
  const text = String(explanation || "");
  const finalMatch = text.match(
    /(?:final answer|answer|therefore|hence|so|=)\s*(?:is|:)?\s*(-?\d+(?:\.\d+)?(?:\s*\/\s*-?\d+(?:\.\d+)?)?)/i
  );
  if (finalMatch?.[1]) {
    const finalNumbers = extractNumbers(finalMatch[1]);
    return finalNumbers.length ? finalNumbers[finalNumbers.length - 1] : null;
  }
  const numbers = extractNumbers(text);
  return numbers.length ? numbers[numbers.length - 1] : null;
}

function alignCompetitiveCorrectOption(q: TopicTestQuestion): TopicTestQuestion | null {
  const options = q.options.map((option) => String(option || "").trim());
  if (hasDuplicateOrEquivalentOptions(options)) return null;

  const correctIndex = q.correctIndex;
  const correctOption = options[correctIndex] || "";
  const explanation = String(q.explanation || "");
  const letterMatch = explanation.match(/\b(?:correct\s*(?:option|answer)?|answer)\s*(?:is|:)?\s*([A-D])\b/i);
  const letterIndex = letterMatch ? letterMatch[1].toUpperCase().charCodeAt(0) - 65 : -1;

  if (letterIndex >= 0 && letterIndex < options.length && letterIndex !== correctIndex) {
    q = { ...q, correctIndex: letterIndex };
  }

  const finalNumber = extractFinalExplanationNumber(explanation);
  if (finalNumber === null) return q;

  const optionNumberSets = options.map((option) => extractNumbers(option));
  const hasNumericOption = optionNumberSets.some((numbers) => numbers.length > 0);
  if (!hasNumericOption) return q;

  const optionMatches = options
    .map((option, index) => ({
      index,
      matches:
        numericExpressionValue(option) === null
          ? optionNumberSets[index].some((num) => sameNumber(num, finalNumber))
          : sameNumber(numericExpressionValue(option) as number, finalNumber),
    }))
    .filter((item) => item.matches);

  if (optionMatches.length !== 1) return null;

  const matchedIndex = optionMatches[0].index;
  const selectedNumbers = extractNumbers(options[q.correctIndex] || "");
  const selectedMatches = selectedNumbers.some((num) => sameNumber(num, finalNumber));

  if (!selectedMatches) {
    return { ...q, correctIndex: matchedIndex };
  }

  const selectedText = normalizeOptionText(options[q.correctIndex] || "");
  const matchedText = normalizeOptionText(options[matchedIndex] || "");
  return selectedText === matchedText || q.correctIndex === matchedIndex
    ? q
    : { ...q, correctIndex: matchedIndex };
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

function hasDuplicateOrEquivalentOptions(options: string[]) {
  const seen = new Set<string>();
  for (const option of options) {
    const key = optionEquivalenceKey(option);
    if (!key || seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function questionSignature(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 16)
    .join(" ");
}

function cleanCompetitiveQuestionText(q: TopicTestQuestion): TopicTestQuestion {
  return {
    ...q,
    question: sanitizePdfSafeText(q.question),
    options: q.options.map((option) => sanitizePdfSafeText(option)),
    explanation: sanitizePdfSafeText(q.explanation),
  };
}

function cleanLabel(value: string, fallback: string) {
  const cleaned = sanitizePdfSafeText(value).replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function makeFallbackQuestion(
  difficulty: "Easy" | "Moderate" | "Hard",
  question: string,
  options: string[],
  correctIndex: number,
  explanation: string
): TopicTestQuestion {
  return {
    id: 0,
    difficulty,
    question: sanitizePdfSafeText(question),
    options: options.map((option) => sanitizePdfSafeText(option)),
    correctIndex,
    explanation: sanitizePdfSafeText(explanation),
  };
}

function unitMeasurementFallbackBank(): TopicTestQuestion[] {
  return [
    makeFallbackQuestion(
      "Easy",
      "Which SI unit is used to measure length in Units and Measurements?",
      ["metre", "kilogram", "second", "kelvin"],
      0,
      "Length is measured in metre in the SI system. Kilogram is for mass, so it is the tempting wrong unit."
    ),
    makeFallbackQuestion(
      "Easy",
      "A student measures the same table three times and gets close values. Which idea is being checked?",
      ["precision", "acceleration", "density", "pressure"],
      0,
      "Close repeated readings show precision. Accuracy is about closeness to the true value, which is a different idea."
    ),
    makeFallbackQuestion(
      "Moderate",
      "Which measurement has 3 significant figures?",
      ["4.50 m", "0.040 m", "5000 m with no decimal point", "7 m"],
      0,
      "4.50 has three significant figures because the zero after the decimal is significant. 0.040 has two significant figures."
    ),
    makeFallbackQuestion(
      "Moderate",
      "If a vernier caliper has 10 vernier divisions equal to 9 main scale divisions of 1 mm each, its least count is",
      ["0.1 mm", "1 mm", "9 mm", "10 mm"],
      0,
      "One vernier division is 0.9 mm, so least count = 1.0 - 0.9 = 0.1 mm. Taking 10 mm directly is the common trap."
    ),
    makeFallbackQuestion(
      "Hard",
      "A length is recorded as 2.40 cm and a breadth as 1.2 cm. For the product, the answer should be reported with",
      ["2 significant figures", "3 significant figures", "4 significant figures", "1 significant figure"],
      0,
      "In multiplication, the final result keeps the least number of significant figures. 1.2 has 2 significant figures, so the product needs 2."
    ),
  ];
}

function lawsOfMotionFallbackBank(): TopicTestQuestion[] {
  return [
    makeFallbackQuestion(
      "Easy",
      "Which quantity is equal to mass x acceleration in Newton's Laws?",
      ["force", "momentum", "velocity", "work"],
      0,
      "Newton's second law gives F = ma. Momentum is mass x velocity, not mass x acceleration."
    ),
    makeFallbackQuestion(
      "Easy",
      "When a bus suddenly stops, passengers tend to move forward because of",
      ["inertia of motion", "inertia of rest", "zero friction", "action-reaction force only"],
      0,
      "The body was moving with the bus and tends to keep moving. Calling it inertia of rest reverses the situation."
    ),
    makeFallbackQuestion(
      "Moderate",
      "A 2 kg body has acceleration 3 m/s^2. The net force on it is",
      ["6 N", "1.5 N", "5 N", "9 N"],
      0,
      "Use F = ma = 2 x 3 = 6 N. Dividing mass by acceleration gives the trap value 1.5."
    ),
    makeFallbackQuestion(
      "Moderate",
      "Two skaters push each other. If skater A pushes B with 40 N, B pushes A with",
      ["40 N in the opposite direction", "40 N in the same direction", "0 N", "more than 40 N always"],
      0,
      "Newton's third law says action and reaction are equal in magnitude and opposite in direction. They act on different bodies."
    ),
    makeFallbackQuestion(
      "Hard",
      "A 5 kg block is pulled by 30 N on a rough surface. Friction is 10 N opposite to motion. Its acceleration is",
      ["4 m/s^2", "6 m/s^2", "2 m/s^2", "8 m/s^2"],
      0,
      "Net force = 30 - 10 = 20 N, so a = F/m = 20/5 = 4 m/s^2. Using 30 N directly ignores friction."
    ),
  ];
}

function fractionsFallbackBank(): TopicTestQuestion[] {
  return [
    makeFallbackQuestion(
      "Easy",
      "Which fraction is equal to 1/2?",
      ["2/4", "1/3", "3/4", "2/3"],
      0,
      "2/4 reduces to 1/2 by dividing numerator and denominator by 2. 1/3 is close-looking but not equal."
    ),
    makeFallbackQuestion(
      "Easy",
      "What is 1/4 + 1/4?",
      ["1/2", "1/8", "2/8", "1/4"],
      0,
      "Same denominators are added by adding numerators: 1/4 + 1/4 = 2/4 = 1/2. Multiplying denominators gives the trap 1/8."
    ),
    makeFallbackQuestion(
      "Moderate",
      "Which is the smallest fraction?",
      ["1/5", "1/3", "1/2", "1/4"],
      0,
      "For unit fractions, a larger denominator means a smaller value. So 1/5 is smaller than 1/4, 1/3, and 1/2."
    ),
    makeFallbackQuestion(
      "Moderate",
      "What is 2/3 of 18?",
      ["12", "9", "6", "27"],
      0,
      "2/3 of 18 means (2 x 18) / 3 = 12. Dividing by 2 instead gives a tempting but wrong 9."
    ),
    makeFallbackQuestion(
      "Hard",
      "A number is first reduced by 1/5 of itself. What fraction of the original number remains?",
      ["4/5", "1/5", "5/4", "3/5"],
      0,
      "Removing 1/5 leaves 1 - 1/5 = 4/5. The removed fraction and remaining fraction are not the same."
    ),
  ];
}

function hcfLcmFallbackBank(): TopicTestQuestion[] {
  return [
    makeFallbackQuestion(
      "Easy",
      "Which number is a factor of 24?",
      ["6", "7", "10", "25"],
      0,
      "6 is a factor because 24 / 6 = 4 exactly. 7 does not divide 24 exactly."
    ),
    makeFallbackQuestion(
      "Easy",
      "Which number is a multiple of 8?",
      ["32", "18", "28", "14"],
      0,
      "32 = 8 x 4, so it is a multiple of 8. 28 is a common trap because it is near 32 but is not divisible by 8."
    ),
    makeFallbackQuestion(
      "Moderate",
      "The HCF of 12 and 18 is",
      ["6", "3", "12", "36"],
      0,
      "Common factors of 12 and 18 include 1, 2, 3, and 6. The highest common factor is 6."
    ),
    makeFallbackQuestion(
      "Moderate",
      "The LCM of 6 and 8 is",
      ["24", "14", "48", "12"],
      0,
      "Multiples of 6 are 6, 12, 18, 24; multiples of 8 are 8, 16, 24. The least common multiple is 24."
    ),
    makeFallbackQuestion(
      "Hard",
      "Two bells ring every 12 minutes and 18 minutes. If they ring together now, after how many minutes will they ring together again?",
      ["36 minutes", "6 minutes", "30 minutes", "216 minutes"],
      0,
      "The next together time is the LCM of 12 and 18, which is 36. HCF 6 is the common trap."
    ),
  ];
}

function genericTopicFallbackBank(ctx: CompetitiveFallbackContext): TopicTestQuestion[] {
  const subject = cleanLabel(ctx.subject, "the subject");
  const chapter = cleanLabel(ctx.chapter, "the selected chapter");
  const topic = cleanLabel(ctx.topic, "the selected topic");
  const classLevel = cleanLabel(ctx.classLevel, "this class");
  const exam = cleanLabel(ctx.exam, "the exam");

  return [
    makeFallbackQuestion(
      "Easy",
      `In ${subject}, the topic "${topic}" belongs most directly to which chapter context?`,
      [chapter, "A different subject", "Only exam instructions", "Only answer sheet marking"],
      0,
      `"${topic}" is being studied under "${chapter}" for ${classLevel}. The other options move away from the selected lesson context.`
    ),
    makeFallbackQuestion(
      "Easy",
      `For "${topic}", which option is the most relevant starting point before solving ${exam}-style questions?`,
      [`Understand the main idea of ${topic}`, "Memorise unrelated examples", "Skip the chapter context", "Study only a different subject"],
      0,
      `A question on "${topic}" should start from the main idea of the topic. Unrelated examples do not test the selected concept.`
    ),
    makeFallbackQuestion(
      "Moderate",
      `A question says it is from "${topic}" in "${chapter}". Which response best stays within the selected concept?`,
      [`Use facts or rules from ${topic}`, "Use a rule from any random chapter", "Use only a different subject", "Use an unrelated example"],
      0,
      `The correct response must use the selected topic's facts or rules. An unrelated example does not test "${topic}".`
    ),
    makeFallbackQuestion(
      "Moderate",
      `Which statement is most suitable for revising "${topic}" in ${subject}?`,
      [`Connect the topic idea with one example from ${chapter}`, "Study only unrelated definitions", "Avoid all examples", "Change the subject while revising"],
      0,
      `Revision is strongest when the idea from "${topic}" is connected to its chapter example. Changing the subject loses the tested context.`
    ),
    makeFallbackQuestion(
      "Hard",
      `In a ${exam}-style MCQ on "${topic}", a close distractor will usually test whether the student can`,
      [`separate the exact ${topic} idea from a nearby idea`, `replace ${topic} with an unrelated idea`, `mix ${topic} with a different chapter`, "ignore the given lesson context"],
      0,
      `A hard distractor is close to the exact idea but not the same. The trap is confusing "${topic}" with a nearby idea from the chapter.`
    ),
  ];
}

function fallbackBankForCompetitiveTopic(ctx: CompetitiveFallbackContext) {
  const key = `${ctx.subject} ${ctx.chapter} ${ctx.topic}`.toLowerCase();
  if (/\b(units?|measurements?|measurement|significant figures?|least count|vernier|si unit)\b/.test(key)) {
    return unitMeasurementFallbackBank();
  }
  if (/\b(laws? of motion|newton'?s? laws?|force|inertia|f\s*=\s*ma|action reaction)\b/.test(key)) {
    return lawsOfMotionFallbackBank();
  }
  if (/\b(fractions?|proper fraction|improper fraction|mixed fraction|numerator|denominator)\b/.test(key)) {
    return fractionsFallbackBank();
  }
  if (/\b(hcf|lcm|highest common factor|least common multiple|factors?|multiples?)\b/.test(key)) {
    return hcfLcmFallbackBank();
  }
  return genericTopicFallbackBank(ctx);
}

function finalizeCompetitiveTopicTest(args: {
  questions: TopicTestQuestion[];
  context: CompetitiveFallbackContext;
}) {
  const finalQuestions: TopicTestQuestion[] = [];
  const usedSignatures = new Set<string>();
  const fallbackBank = fallbackBankForCompetitiveTopic(args.context);

  const takeQuestion = (
    q: TopicTestQuestion,
    difficulty: "Easy" | "Moderate" | "Hard",
    options: { alignAnswer?: boolean } = {}
  ) => {
    const normalized = normalizeGeneratedQuestions([q], true)[0];
    if (!normalized) return false;
    const aligned =
      options.alignAnswer === false
        ? (normalized as TopicTestQuestion)
        : alignCompetitiveCorrectOption(normalized as TopicTestQuestion);
    if (!aligned) return false;
    const cleaned = cleanCompetitiveQuestionText({
      ...aligned,
      difficulty,
    });
    if (isGenericCompetitiveFallbackQuestion(cleaned)) return false;
    if (hasDuplicateOrEquivalentOptions(cleaned.options)) return false;
    const signature = questionSignature(cleaned.question);
    if (!signature || usedSignatures.has(signature)) return false;
    usedSignatures.add(signature);
    finalQuestions.push({
      ...cleaned,
      id: finalQuestions.length + 1,
      difficulty,
    });
    return true;
  };

  for (const difficulty of COMPETITIVE_DIFFICULTY_MIX) {
    const aiIndex = args.questions.findIndex((q) => {
      const existingSignature = questionSignature(q.question);
      return existingSignature && !usedSignatures.has(existingSignature);
    });
    if (aiIndex >= 0) {
      const [candidate] = args.questions.splice(aiIndex, 1);
      if (takeQuestion(candidate, difficulty)) continue;
    }

    const fallback =
      fallbackBank.find((q) => q.difficulty === difficulty && !usedSignatures.has(questionSignature(q.question))) ||
      fallbackBank.find((q) => !usedSignatures.has(questionSignature(q.question)));
    if (fallback) takeQuestion(fallback, difficulty, { alignAnswer: false });
  }

  return finalQuestions.slice(0, COMPETITIVE_TOPIC_TEST_COUNT).map((q, index) => ({
    ...q,
    id: index + 1,
    difficulty: COMPETITIVE_DIFFICULTY_MIX[index],
  }));
}

function isGenericCompetitiveFallbackQuestion(q: TopicTestQuestion) {
  const text = `${q.question}\n${q.options.join("\n")}\n${q.explanation}`.toLowerCase();
  return (
    /\bwhich approach is (?:safer|safest|best)\b/.test(text) ||
    /\bcheck the concept\b/.test(text) ||
    /\bsolve (?:cleanly|clearly)\b/.test(text) ||
    /\bmatch the final answer\b/.test(text) ||
    /\bpick the option that looks\b/.test(text) ||
    /\bignore units and signs\b/.test(text) ||
    /\bcompetitive mcqs require concept check\b/.test(text) ||
    /\bfinal verification\b/.test(text)
  );
}

function competitivePatternSignature(q: TopicTestQuestion) {
  return String(q.question || "")
    .toLowerCase()
    .replace(/\d+(?:\.\d+)?/g, "#")
    .replace(/[^a-z0-9#]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 12)
    .join(" ");
}

function selectCompetitiveQuestions(args: {
  questions: TopicTestQuestion[];
  requestedCount: number;
}) {
  const target = Math.max(1, Math.min(10, Math.floor(args.requestedCount || 5)));
  const result: TopicTestQuestion[] = [];
  const seen = new Set<string>();
  const seenPatterns = new Set<string>();

  for (const q of args.questions) {
    const cleaned = cleanCompetitiveQuestionText(q);
    if (isGenericCompetitiveFallbackQuestion(cleaned)) continue;
    const signature = questionSignature(cleaned.question);
    const pattern = competitivePatternSignature(cleaned);
    if (!signature || seen.has(signature) || seenPatterns.has(pattern)) continue;
    seen.add(signature);
    if (pattern) seenPatterns.add(pattern);
    result.push({ ...cleaned, id: result.length + 1 });
    if (result.length === target) break;
  }

  return result;
}

function stripJsonFences(rawInput: string) {
  let raw = String(rawInput || "").trim();
  if (raw.startsWith("```")) {
    const firstNewline = raw.indexOf("\n");
    raw = raw.slice(firstNewline + 1);
    if (raw.startsWith("json")) {
      const secondNewline = raw.indexOf("\n");
      raw = raw.slice(secondNewline + 1);
    }
    const fence = raw.lastIndexOf("```");
    if (fence !== -1) raw = raw.slice(0, fence);
    raw = raw.trim();
  }
  return raw;
}

function normalizeGeneratedQuestions(questions: TopicTestQuestion[], isCompetitive: boolean) {
  return questions
    .map((q, index) => ({
      id: q.id ?? index + 1,
      difficulty: ["Easy", "Moderate", "Hard"].includes(String((q as any).difficulty || ""))
        ? String((q as any).difficulty)
        : isCompetitive
        ? "Moderate"
        : undefined,
      question: String(q.question || "").trim(),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : 0,
      explanation: String(q.explanation || "").trim(),
    }))
    .filter(
      (q) =>
        q.question &&
        q.options.length === 4 &&
        q.correctIndex >= 0 &&
        q.correctIndex < 4
    );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
const mobile = String(body.mobile || body.studentMobile || "").trim();

if (!mobile) {
  return NextResponse.json(
    { ok: false, error: "Missing mobile." },
    { status: 400 }
  );
}
await requireStudentMobile(req, mobile);

const entitlementRes = await fetch(
  `${new URL(req.url).origin}/api/student/entitlements?mobile=${encodeURIComponent(mobile)}`,
  {
    cache: "no-store",
    headers: {
      Authorization: req.headers.get("authorization") || "",
      cookie: req.headers.get("cookie") || "",
    },
  }
);
const { data: ent, errorText: entitlementError } =
  await readJsonResponse<any>(entitlementRes);

if (!entitlementRes.ok || !ent?.ok) {
  return NextResponse.json(
    {
      ok: false,
      error:
        ent?.error ||
        entitlementError ||
        "Unable to verify entitlement for topic test.",
    },
    {
      status:
        entitlementRes.status >= 400 && entitlementRes.status < 500
          ? entitlementRes.status
          : 502,
    }
  );
}

if (!ent.features?.topicTest) {
  return NextResponse.json(
    { ok: false, error: "Topic tests are not available in the current access state." },
    { status: 403 }
  );
}
    const board = (body.board as string) || "CBSE";
    const classLevel = (body.classLevel as string) || "Class 6";
    const subject = (body.subject as string) || "Mathematics";
    const chapter = (body.chapter as string) || "";
    const topic = (body.topic as string) || "";
    const track = String(body?.track || body?.subjectType || body?.courseType || "regular");
    const competitiveExam = competitiveExamLabel(body?.competitiveExam || body?.exam || board);
    const isCompetitive = isCompetitiveMode(track);
    const numQuestions = isCompetitive
      ? COMPETITIVE_TOPIC_TEST_COUNT
      : Number(body.numQuestions || 5);
    const needsNumericalApplication =
      /\b(math|mathematics|physics|quant|aptitude|jee)\b/i.test(
        `${subject} ${competitiveExam}`
      );

    const apiKey =
      process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey && !isCompetitive) {
      return NextResponse.json(
        { ok: false, error: "Missing OpenAI API key." },
        { status: 500 }
      );
    }
    const client = apiKey ? new OpenAI({ apiKey }) : null;

    const language: "en" | "hi" | "bn" =
      (body.language as "en" | "hi" | "bn") || "en";

    const languageInstruction =
      language === "bn"
        ? `
Write all questions, options and explanations in very simple Bengali (Bangla)
for ${classLevel} students in India (West Bengal / Tripura style).
Use only Bengali sentences (à¦¬à¦¾à¦‚à¦²à¦¾) â€“ no English words except digits (0-9)
and math symbols (+, -, Ã—, Ã·, =, %).
Do NOT use any religious greeting or phrase. Use neutral school-style tone.
`.trim()
        : language === "hi"
        ? `
Write all questions, options and explanations in very simple Hindi
for ${classLevel} students in India.
Use only Hindi sentences â€“ no English words except digits (0-9)
and math symbols (+, -, Ã—, Ã·, =, %).
Do NOT use any religious greeting or phrase. Use a neutral school tone.
`.trim()
        : `
Write all questions, options and explanations in very simple English
for Indian school students in ${classLevel}.
Use short sentences, no difficult words, and India-style examples.
Do NOT use any religious greeting or phrase. Neutral school tone only.
`.trim();

    const systemPrompt = `
You are an experienced ${isCompetitive ? `${competitiveExam} competitive exam` : "school exam"} paper setter for Indian students.

Your task:
- Create ${numQuestions} multiple-choice questions (MCQs)
- Topic: "${topic}" in ${classLevel}
- Subject: ${subject}, Board: ${board}
- Difficulty: ${isCompetitive ? "medium to exam-level with conceptual traps, not generic recall" : "Easy to medium for revision, not olympiad level"}.

${languageInstruction}

${isCompetitive ? buildCompetitiveJsonQuestionInstruction(competitiveExam) : ""}

Return ONLY valid JSON (no markdown, no backticks), in this exact format:

[
  {
    "id": 1,
    ${isCompetitive ? '"difficulty": "Moderate",' : ""}
    "question": "Question text here",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Short explanation in the same language"
  }
]

Rules:
- 4 options per question.
- correctIndex is 0, 1, 2 or 3 matching the correct option.
${isCompetitive ? "- difficulty must be Easy, Moderate, or Hard." : ""}
${isCompetitive && needsNumericalApplication ? "- At least 2 questions must be numerical/application MCQs with values, formula use, and calculation logic." : ""}
${isCompetitive ? "- Before returning JSON, verify every generated question: correctIndex must point to the exact option proven by the explanation." : ""}
${isCompetitive ? "- If options are generated with numeric values, the explanation's calculation/final result must be numerically consistent with the correct option and must be one of the options." : ""}
${isCompetitive ? "- If the calculated or explained answer is not present in the options, fix the options or correctIndex before returning JSON." : ""}
${isCompetitive ? "- Every question must be topic-specific. Never ask generic strategy questions such as which approach is safest, how to check concepts, or how to verify answers." : ""}
${isCompetitive ? "- Do not use repeated question templates with only changed numbers." : ""}
- explanation should be ${isCompetitive ? "2-4 compact sentences with correct logic and trap analysis" : "1-3 short sentences"}.
- ${isCompetitive ? "explanation should include the key concept, correct option logic, and one common trap." : "Keep explanations simple and revision friendly."}
- No religious or political content.
- No extra fields beyond ${isCompetitive ? "id, difficulty, question, options, correctIndex, explanation" : "id, question, options, correctIndex, explanation"}.
`.trim();

    const userPrompt = `
Generate ${numQuestions} MCQs for:

Board: ${board}
Class: ${classLevel}
Track: ${isCompetitive ? `competitive (${competitiveExam})` : "regular"}
Subject: ${subject}
Chapter: ${chapter || "(chapter name not given)"}
Topic: ${topic}

Return ONLY JSON in the exact array format described.
`.trim();

    const generateQuestions = async (strictRetry: boolean) => {
      if (!client) return { parsed: [], raw: "" };

      const retryInstruction = strictRetry
        ? `
STRICT RETRY:
- The previous output failed QA.
- Return exactly ${numQuestions} fresh, topic-specific MCQs for Topic: "${topic}".
- Do not include any generic exam-strategy question.
- Do not ask "which approach is safest/best" or similar.
- Do not use options about checking concepts, solving clearly, picking long options, or ignoring units.
- Use five distinct sub-concepts or application patterns from the selected topic.
`.trim()
        : "";

      const response = await client.responses.create({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${userPrompt}${retryInstruction ? `\n\n${retryInstruction}` : ""}` },
        ],
      });

      const raw = stripJsonFences(response.output_text || "");
      let parsed: TopicTestQuestion[];
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        console.error("topic-test JSON parse error:", err, raw);
        return { parsed: [], raw };
      }

      return { parsed: Array.isArray(parsed) ? parsed : [], raw };
    };

    const firstGeneration = await generateQuestions(false);
    let questions = firstGeneration.parsed;
    let didStrictRetry = false;

    if (!Array.isArray(questions) || questions.length === 0) {
      if (!isCompetitive) {
        return NextResponse.json(
          { ok: false, error: "AI returned no questions." },
          { status: 500 }
        );
      }
      const retryGeneration = await generateQuestions(true);
      didStrictRetry = true;
      questions = retryGeneration.parsed;
    }

    const cleanedBase = normalizeGeneratedQuestions(questions, isCompetitive);

    let cleaned = isCompetitive
      ? cleanedBase
          .map((q) => alignCompetitiveCorrectOption(q as TopicTestQuestion))
          .filter((q): q is TopicTestQuestion => !!q)
      : cleanedBase;

    let responseQuestions = isCompetitive
      ? selectCompetitiveQuestions({
          questions: cleaned,
          requestedCount: numQuestions,
        })
      : cleaned;

    if (
      isCompetitive &&
      !didStrictRetry &&
      responseQuestions.length < Math.max(1, Math.min(10, Math.floor(numQuestions || 5)))
    ) {
      const retryGeneration = await generateQuestions(true);
      didStrictRetry = true;
      const retryBase = normalizeGeneratedQuestions(retryGeneration.parsed, isCompetitive);
      cleaned = retryBase
        .map((q) => alignCompetitiveCorrectOption(q as TopicTestQuestion))
        .filter((q): q is TopicTestQuestion => !!q);
      responseQuestions = selectCompetitiveQuestions({
        questions: cleaned,
        requestedCount: numQuestions,
      });
    }

    if (!cleaned.length && !isCompetitive) {
      return NextResponse.json(
        { ok: false, error: "All generated questions were invalid." },
        { status: 500 }
      );
    }

    if (isCompetitive) {
      responseQuestions = finalizeCompetitiveTopicTest({
        questions: [...responseQuestions],
        context: {
          subject,
          chapter,
          topic,
          classLevel,
          exam: competitiveExam,
        },
      });
    }

    return NextResponse.json({ ok: true, questions: responseQuestions });
  } catch (err) {
    if (err instanceof OwnershipError) return ownershipErrorResponse(err);
    console.error("topic-test route error:", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error in topic-test." },
      { status: 500 }
    );
  }
}

