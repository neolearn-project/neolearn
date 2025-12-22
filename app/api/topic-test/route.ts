// app/api/topic-test/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

type TopicTestQuestion = {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const board = (body.board as string) || "CBSE";
    const classLevel = (body.classLevel as string) || "Class 6";
    const subject = (body.subject as string) || "Mathematics";
    const chapter = (body.chapter as string) || "";
    const topic = (body.topic as string) || "";
    const numQuestions = Number(body.numQuestions || 5);

    const language: "en" | "hi" | "bn" =
      (body.language as "en" | "hi" | "bn") || "en";

    const languageInstruction =
      language === "bn"
        ? `
Write all questions, options and explanations in very simple Bengali (Bangla)
for ${classLevel} students in India (West Bengal / Tripura style).
Use only Bengali sentences (বাংলা) – no English words except digits (0-9)
and math symbols (+, -, ×, ÷, =, %).
Do NOT use any religious greeting or phrase. Use neutral school-style tone.
`.trim()
        : language === "hi"
        ? `
Write all questions, options and explanations in very simple Hindi
for ${classLevel} students in India.
Use only Hindi sentences – no English words except digits (0-9)
and math symbols (+, -, ×, ÷, =, %).
Do NOT use any religious greeting or phrase. Use a neutral school tone.
`.trim()
        : `
Write all questions, options and explanations in very simple English
for Indian school students in ${classLevel}.
Use short sentences, no difficult words, and India-style examples.
Do NOT use any religious greeting or phrase. Neutral school tone only.
`.trim();

    const systemPrompt = `
You are an experienced school exam paper setter for Indian boards.

Your task:
- Create ${numQuestions} multiple-choice questions (MCQs)
- Topic: "${topic}" in ${classLevel}
- Subject: ${subject}, Board: ${board}
- Difficulty: Easy to medium for revision, not olympiad level.

${languageInstruction}

Return ONLY valid JSON (no markdown, no backticks), in this exact format:

[
  {
    "id": 1,
    "question": "Question text here",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Short explanation in the same language"
  }
]

Rules:
- 4 options per question.
- correctIndex is 0, 1, 2 or 3 matching the correct option.
- explanation should be 1–3 short sentences.
- No religious or political content.
- No extra fields.
`.trim();

    const userPrompt = `
Generate ${numQuestions} MCQs for:

Board: ${board}
Class: ${classLevel}
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
    const cleaned = questions
      .map((q, index) => ({
        id: q.id ?? index + 1,
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

    if (!cleaned.length) {
      return NextResponse.json(
        { ok: false, error: "All generated questions were invalid." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, questions: cleaned });
  } catch (err) {
    console.error("topic-test route error:", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error in topic-test." },
      { status: 500 }
    );
  }
}
