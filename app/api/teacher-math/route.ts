import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  getTeacherConfig,
  BoardId,
  LangCode,
  ClassId,
  SubjectId,
} from "@/app/lib/teacherConfig";

// Decide model based on question complexity
function pickModel(question: string): string {
  const q = question.toLowerCase();
  const length = question.length;

  const heavyKeywords =
    /(prove|proof|derivative|integral|integration|trigonometry|physics|chemistry|why does|explain why)/;

  if (heavyKeywords.test(q) || length > 400) {
    return "gpt-5.1"; // strongest
  }

  if (length < 120) {
    return "gpt-5-nano"; // cheap & fast
  }

  return "gpt-5-mini"; // default
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = (body?.question || "").trim();
    const studentClass = (body?.student_class || "Class 6").trim();

    if (!question) {
      return NextResponse.json(
        { error: "Please type your question." },
        { status: 400 }
      );
    }

    // Get OpenAI key inside handler (important for Vercel)
    const apiKey =
      process.env.OPENAI_API_KEY || process.env.NEOLEARN_OPENAI_API_KEY;

    if (!apiKey) {
      console.error("Missing OpenAI key (Vercel environment)");
      return NextResponse.json(
        {
          error:
            "Teacher is temporarily unavailable (server is missing OpenAI API key).",
        },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    // ------------ NEW CONFIG INPUTS -------------
    const subjectId = (body?.subjectId || "maths") as SubjectId;
    const classId = ((body?.classId as string) || "6") as ClassId;

    const board = (body?.board as BoardId) || "cbse";
    const lang = (body?.lang as LangCode) || "en";
    const chapterId = (body?.chapterId as string) || "fractions";

    const teacher = getTeacherConfig(subjectId, classId);
    const chapter =
      teacher.chapters.find((c) => c.id === chapterId) ||
      teacher.chapters[0];
    // --------------------------------------------

    // Language instruction
    const languageInstruction =
      lang === "hi"
        ? "Reply in simple Hindi that a child of this class in India can understand. Keep sentences short."
        : lang === "bn"
        ? "Reply in simple Bengali that a child of this class in India can understand. Use easy Bengali sentences."
        : "Reply in simple English that a child of this class can understand.";

    // Board label
    const boardLabel =
      board === "icse"
        ? "ICSE (CISCE)"
        : board === "tbse"
        ? "TBSE / Tripura Board"
        : "CBSE (NCERT)";

    // ---------- SYSTEM PROMPT ----------
    const systemPrompt = `
You are a kind Indian school teacher.

Subject: ${teacher.displayName}
Board: ${boardLabel}
Class: ${teacher.classId}
Chapter: ${chapter.title}

${languageInstruction}

Your job is to:
- Restate the child's doubt in one simple line.
- Explain step-by-step clearly.
- Give 1–2 small worked examples related to ${chapter.title}.
- Use short, simple sentences.
- End with one follow-up question to check understanding.
    `.trim();

    // ---------- USER PROMPT ------------
    const userPrompt = `
Student class label (UI): ${studentClass}
Internal class: ${teacher.classId}
Board: ${boardLabel}
Chapter: ${chapter.title}

Student question: ${question}

Explain according to the syllabus of this class and board, focused on the given chapter.
    `.trim();

    // Choose model
    const model = pickModel(question);

    // ----------- CALL OPENAI -----------
    const rawResponse = await client.responses.create({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    // -------- SAFE ANSWER EXTRACTION --------
    let answer = "Sorry, I could not answer this question.";

    try {
      const response: any = rawResponse;

      if (response.output_text) {
        answer = response.output_text;
      } else if (response.output?.[0]?.content) {
        answer = response.output[0].content
          .map((c: any) => c.text || c.value || "")
          .join(" ");
      }
    } catch (e) {
      console.error("Answer parsing error:", e);
    }
    // ----------------------------------------

    // ---- Optional: generate audio using OpenAI TTS for voice teacher ----
    let audioBase64 = "";

    try {
      const tts = await client.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: answer,
        format: "mp3",
      });

      const arrayBuffer = await tts.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      audioBase64 = buffer.toString("base64");
    } catch (e) {
      console.error("TTS error:", e);
    }

    return NextResponse.json(
      {
        answer,
        modelUsed: model,
        audio: audioBase64 ? `data:audio/mp3;base64,${audioBase64}` : null,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("teacher-math error:", err);

    const msg =
      err?.error?.message || err?.message || "Unknown OpenAI error";

    if (msg.toLowerCase().includes("insufficient_quota")) {
      return NextResponse.json(
        {
          error:
            "Teacher is busy because the AI quota/credit is over. Please recharge OpenAI billing.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error:
          "Teacher could not answer just now. Please try again shortly.",
      },
      { status: 500 }
    );
  }
}
