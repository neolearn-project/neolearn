// app/api/generate-lesson/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const board = (body.board as string) || "CBSE";
    const classLevel = (body.classLevel as string) || "Class 6";
    const subject = (body.subject as string) || "Mathematics";
    const topic = (body.topic as string) || "Fractions";

    // 👇 from frontend: "en" | "hi" | "bn"
    const language: "en" | "hi" | "bn" = (body.language as any) || "en";

    const languageInstruction =
      language === "bn"
        ? `
Explain everything in very simple Bengali (Bangla) suitable for ${classLevel} students.
Use only Bengali sentences (বাংলা), do NOT mix English words except digits (0-9)
and necessary math symbols such as +, -, ×, ÷, =, %.
Keep sentences short and friendly, like a private tutor in West Bengal/Tripura.
`.trim()
        : language === "hi"
        ? `
Explain everything in very simple Hindi suitable for ${classLevel} students in India.
Use only Hindi sentences, do NOT mix English words except digits (0-9)
and necessary math symbols such as +, -, ×, ÷, =, %.
Keep sentences short, friendly and easy to understand.
`.trim()
        : `
Explain everything in very simple English suitable for Indian school students in ${classLevel}.
Use short sentences, no difficult words, and examples that feel Indian (rupees, local names, etc.).
Do not speak like a foreign teacher.
`.trim();

    const systemPrompt = `
You are a very friendly FEMALE teacher in a professional Indian coaching institute called NeoLearn.
You always teach slowly, clearly and in a warm, encouraging tone.

${languageInstruction}

When you teach the topic, follow this structure:

1. One-line warm greeting to the student.
2. 3–6 short bullet points explaining the concept step by step.
3. 2–3 simple numerical examples.
4. One small practice question at the end (do NOT give the answer).
5. Keep the whole script short (2–3 minutes of speaking).

Do not write headings like "Introduction" or "Conclusion".
Speak naturally as if you are talking to the student.
`.trim();

    const userPrompt = `
Board: ${board}
Class: ${classLevel}
Subject: ${subject}
Topic: ${topic}

Write the TEACHING SCRIPT exactly as you would speak to the student in one continuous talk.
`.trim();

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const script = (response.output_text || "").trim();

    if (!script) {
      return NextResponse.json(
        { ok: false, error: "OpenAI returned an empty lesson script." },
        { status: 500 }
      );
    }

    // Frontend expects script/text
    return NextResponse.json({ ok: true, script });
  } catch (err) {
    console.error("generate-lesson error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to generate lesson script." },
      { status: 500 }
    );
  }
}
