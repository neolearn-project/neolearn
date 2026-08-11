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
      matches: optionNumberSets[index].some((num) => sameNumber(num, finalNumber)),
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

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let raw = (response.output_text || "").trim();

    // Strip ``` fences if the model added them
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

    let questions: TopicTestQuestion[];
    try {
      questions = JSON.parse(raw);
    } catch (err) {
      console.error("topic-test JSON parse error:", err, raw);
      return NextResponse.json(
        { ok: false, error: "AI did not return valid JSON.", raw },
        { status: 500 }
      );
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json(
        { ok: false, error: "AI returned no questions." },
        { status: 500 }
      );
    }

    // Basic validation
    const cleanedBase = questions
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

    const cleaned = isCompetitive
      ? cleanedBase
          .map((q) => alignCompetitiveCorrectOption(q as TopicTestQuestion))
          .filter((q): q is TopicTestQuestion => !!q)
      : cleanedBase;

    if (!cleaned.length) {
      return NextResponse.json(
        { ok: false, error: "All generated questions were invalid." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, questions: cleaned });
  } catch (err) {
    if (err instanceof OwnershipError) return ownershipErrorResponse(err);
    console.error("topic-test route error:", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error in topic-test." },
      { status: 500 }
    );
  }
}

