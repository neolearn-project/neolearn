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
    const apiKey =
      process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing OpenAI API key." },
        { status: 500 }
      );
    }
    const client = new OpenAI({ apiKey });

    const board = (body.board as string) || "CBSE";
    const classLevel = (body.classLevel as string) || "Class 6";
    const subject = (body.subject as string) || "Mathematics";
    const chapter = (body.chapter as string) || "";
    const topic = (body.topic as string) || "";
    const numQuestions = Number(body.numQuestions || 5);
    const track = String(body?.track || body?.subjectType || body?.courseType || "regular");
    const competitiveExam = competitiveExamLabel(body?.competitiveExam || body?.exam || board);
    const isCompetitive = isCompetitiveMode(track);
    const needsNumericalApplication =
      /\b(math|mathematics|physics|quant|aptitude|jee)\b/i.test(
        `${subject} ${competitiveExam}`
      );

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

    if (isCompetitive && responseQuestions.length < Math.max(1, Math.min(10, Math.floor(numQuestions || 5)))) {
      return NextResponse.json(
        { ok: false, error: "Could not generate a reliable topic test. Please try again." },
        { status: 502 }
      );
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

