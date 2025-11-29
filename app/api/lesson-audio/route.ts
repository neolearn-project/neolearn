// app/api/lesson-audio/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

type LessonAudioBody = {
  text?: string;
  language?: "en" | "hi" | "bn";
  speed?: number | string;
};

function buildTtsInstructions(
  language: "en" | "hi" | "bn" | undefined
): string {
  if (language === "hi") {
    return `
You are a friendly **female Indian school teacher** speaking clear Hindi.
Speak slowly and clearly, like a teacher in a CBSE school in India.
Avoid mixing English words except common maths terms like "fraction", "numerator", etc.
    `.trim();
  }

  if (language === "bn") {
    return `
You are a friendly **female Indian school teacher** speaking pure Bengali (Bangla).
Speak in clear standard Bengali used in Tripura / West Bengal schools.
Avoid mixing Hindi. Use English words only for necessary maths terms.
    `.trim();
  }

  // default: English with Indian accent
  return `
You are a friendly **female Indian maths teacher** speaking English with a natural Indian accent.
Speak slowly, clearly and warmly so Indian children can understand easily.
Avoid American or British slang.
  `.trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LessonAudioBody;

    const text = (body.text || "").trim();
    const language = body.language || "en";

    if (!text) {
      return NextResponse.json(
        { error: "Missing 'text' field for lesson audio." },
        { status: 400 }
      );
    }

    // Playback speed for HTML audio is handled on the frontend.
    // Here we keep speed fixed for natural voice.
    const instructions = buildTtsInstructions(language);

    const response = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy", // voice family; instructions control tone + accent
      format: "mp3",
      input: text,
      instructions,
      // speed param is ignored for gpt-4o-mini-tts, but harmless if set:
      // speed: safeSpeed,
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("lesson-audio error:", err?.message || err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          "Failed to generate lesson audio. Please try again later.",
      },
      { status: 500 }
    );
  }
}
