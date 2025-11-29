// app/api/teacher-qa/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const classLevel = body.classLevel || "Class 6";
    const subject = body.subject || "Maths";
    const chapter = body.chapter || "Fractions – introduction";
    const language = (body.language as "en" | "hi" | "bn") || "en";
    const question: string | undefined = body.question;
    const previous = (body.previousMessages as string | undefined) || "";

    if (!question || !question.trim()) {
      return NextResponse.json(
        { error: "Missing question" },
        { status: 400 }
      );
    }

    const languageInstruction =
      language === "hi"
        ? "Answer in simple Hindi that a Class 6 student can understand."
        : language === "bn"
        ? "Answer in simple Bengali that a Class 6 student can understand."
        : "Answer in very simple English that a Class 6 student can understand.";

    const prompt = `
You are NeoLearn's friendly ${subject} teacher for ${classLevel}.

Student is studying chapter: "${chapter}".

The student has this doubt or question:

"${question}"

${previous ? `Conversation so far:\n${previous}\n` : ""}

Your job:
- Explain the answer gently.
- Use short, clear sentences.
- Do not give very advanced formulas.
- Encourage the student at the end.
- Keep it within 4–8 sentences.

${languageInstruction}
    `.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a kind school teacher. You explain like you are talking to one child, not writing an exam answer.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.6,
    });

    const answer =
      completion.choices[0]?.message?.content?.trim() ||
      "I am sorry, I could not generate an answer. Please try again.";

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("teacher-qa error:", err);
    return NextResponse.json(
      { error: "Failed to generate teacher answer" },
      { status: 500 }
    );
  }
}
