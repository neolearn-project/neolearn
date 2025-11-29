import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
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
