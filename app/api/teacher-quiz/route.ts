import { NextResponse } from "next/server";
import OpenAI from "openai";

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEOLEARN_OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function POST(req: Request) {
  const openai = getOpenAIClient();
  if (!openai) {
    return NextResponse.json({ ok: false, error: "Missing OpenAI API key" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const topicName = String(body?.topicName || "Fractions").trim();
    const classId = String(body?.classId || "6").trim();
    const board = String(body?.board || "cbse").trim();
    const level = String(body?.level || "easy").trim(); // easy|medium|hard
    const lang = String(body?.lang || "en").trim();

    const system = `
You are an Indian school teacher.
Create a small quiz for Class ${classId} (${board.toUpperCase()}).
Topic: ${topicName}
Difficulty: ${level}
Language: ${lang}

Return STRICT JSON only:
{
  "topic": "...",
  "level": "...",
  "questions": [
    {
      "type": "mcq",
      "q": "...",
      "options": ["A","B","C","D"],
      "answerIndex": 0,
      "explain": "1-2 lines"
    }
  ]
}
Rules:
- Make 3 MCQs.
- Keep questions short.
- Explanation very short.
`.trim();

    const r = await openai.responses.create({
      model: "gpt-5-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: "Generate the quiz now." },
      ],
    });

    const text = (r as any).output_text || "";
    // In case model includes extra text, try to extract JSON safely:
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    const jsonText =
      firstBrace >= 0 && lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1) : text;

    let parsed: any = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      // fallback: return raw
      return NextResponse.json({ ok: true, raw: text }, { status: 200 });
    }

    return NextResponse.json({ ok: true, quiz: parsed }, { status: 200 });
  } catch (e: any) {
    console.error("teacher-quiz error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
