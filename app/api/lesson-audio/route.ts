import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAccessOrThrow } from "@/app/lib/accessGuard";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const studentMobile = String(body.studentMobile || body.mobile || "").trim();
    if (!studentMobile) {
      return NextResponse.json(
        { ok: false, error: "studentMobile is required." },
        { status: 400 }
      );
    }

    try {
      await requireAccessOrThrow({ mobile: studentMobile, feature: "tts" });
    } catch (accessErr: any) {
      if (accessErr?.message === "ACCESS_DENIED") {
        return NextResponse.json(
          { ok: false, error: "Free limit reached. Please subscribe." },
          { status: 403 }
        );
      }
      throw accessErr;
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: "OpenAI API key missing on server." },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiKey });
    const text: string = (body.text || "").trim();
    const language: string = body.language || "English";
    const speed: string = body.speed || "Normal";

    if (!text) {
      return NextResponse.json(
        { error: "Missing 'text' field for lesson audio." },
        { status: 400 }
      );
    }

    // Convert UI speed to TTS speed values
    const ttsSpeed =
      speed === "Slow" ? 0.9 : speed === "Fast" ? 1.3 : 1.0;

    // Choose a pleasant female voice
    // Options: "alloy", "verse", "emma", "coral"
    const voice = "coral";

const instructions =
  "You are a friendly NeoLearn maths teacher. Speak clearly in the requested language (en, hi, bn) for school students.";

   const speech = await openai.audio.speech.create({
  model: "gpt-4o-mini-tts",
  voice: "alloy",               
  response_format: "mp3",       
  input: text,
  instructions,
  // speed: numericSpeed,       
});


    const audioBuffer = Buffer.from(await speech.arrayBuffer());

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("TTS generation error:", err);
    return NextResponse.json(
      { error: "Audio generation failed", details: err.message },
      { status: 500 }
    );
  }
}

/*
curl -X POST http://localhost:3004/api/lesson-audio \
  -H "Content-Type: application/json" \
  -d '{"studentMobile":"9999999999","text":"Hello students","language":"English","speed":"Normal"}'
*/
