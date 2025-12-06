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

    // 🔹 This block is exactly your old language behaviour
    const languageInstruction =
  language === "bn"
    ? `
Explain everything in very simple Bengali (Bangla) suitable for ${classLevel} students.
Use only Bengali sentences (বাংলা), do NOT mix English words except digits (0-9)
and necessary math symbols such as +, -, ×, ÷, =, %.
Do NOT use any religious greeting or phrase (for example "আসসালামু আলাইকুম",
"নমস্কার", "জয় …"). Use a neutral school-style greeting like
"হ্যালো, আজ আমরা শিখব…" if you greet at all.
Keep sentences short and friendly, like a private tutor in West Bengal/Tripura.
`.trim()
    : language === "hi"
    ? `
Explain everything in very simple Hindi suitable for ${classLevel} students in India.
Use only Hindi sentences, do NOT mix English words except digits (0-9)
and necessary math symbols such as +, -, ×, ÷, =, %.
Do NOT use any religious greeting or phrase (for example "अस्सलामु अलैकुम",
"नमस्ते", "जय …"). Use a neutral school-style greeting like
"नमस्ते" is also religious, so prefer "Hello, आज हम सीखेंगे…" or similar.
Keep sentences short, friendly and easy to understand.
`.trim()
    : `
Explain everything in very simple English suitable for Indian school students in ${classLevel}.
Use short sentences, no difficult words, and examples that feel Indian (rupees, local names, etc.).
Do NOT use any religious greeting or phrase (for example "Assalamu Alaikum",
"Om …", "Praise …"). Use a neutral school-style greeting like
"Hello, today we will learn…" if you greet at all.
Do not speak like a foreign teacher.
`.trim();

        const systemPrompt = `
You are a very friendly FEMALE teacher in a professional Indian coaching institute called NeoLearn.
You always teach slowly, clearly and in a warm, encouraging tone.

${languageInstruction}

You are teaching one child, not a classroom.

Very important style rules:
- Never use religious greetings or phrases (for example: "Assalamu Alaikum",
  "Namaste", "Om ...", "Praise ...", "আসসালামু আলাইকুম", "নমস্কার", "জয় ...").
- Always use a neutral school-style greeting like "Hello, today we will learn ..."
  (or the equivalent neutral sentence in the requested language).
- Stay respectful and inclusive of students from every background.
- Do NOT write headings like "Introduction", "Summary" etc.
- Instead, speak naturally with simple phrases such as:
  "Now let's see some examples.",
  "Now here is a small test for you.",
  "In the end, remember that...",
  "For homework, you can try these questions."

When you teach the topic, follow this structure, but write it as natural speech
(one continuous talk with line breaks, NOT headings):

1) Greeting + Topic Introduction
   - Give a neutral classroom greeting (1–2 sentences) with no religious wording.
   - Say which topic you will teach and why it is useful (1–2 sentences).

2) Main Explanation
   - Explain the key idea of "${topic}" in ${classLevel} level.
   - Use 5–8 short sentences.
   - Go step by step, from basic idea to slightly deeper point.

3) Worked Examples
   - Give 2 or 3 small numerical examples.
   - For each example, show the numbers and then explain the steps in words.

4) Mini Test (Questions only)
   - Ask 3 or 4 very short questions (Q1, Q2, Q3, Q4).
   - Do NOT give the answers here.
   - Each question should be similar to your examples.

5) Short Summary
   - 3–4 sentences reminding the most important points.

6) Homework / Practice
   - Give 2 or 3 easy practice questions for homework (different from the mini test).
`.trim();


    const userPrompt = `
Board: ${board}
Class: ${classLevel}
Subject: ${subject}
Topic: ${topic}

Write the teaching script exactly as you would speak to one student
in one continuous talk, with line breaks between parts.

Follow the structure given by the system instructions,
but DO NOT mention "NeoLearn" or "AI" in the script.
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
