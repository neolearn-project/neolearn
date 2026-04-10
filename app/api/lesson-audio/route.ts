import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
const mobile = String(body.mobile || "").trim();
const text: string = String(body.text || body.lessonText || "").trim();
const language: string = body.language || "English";
const speed: string = body.speed || "Normal";

if (!mobile) {
  return NextResponse.json(
    { error: "Missing mobile field for lesson audio." },
    { status: 400 }
  );
}

const entitlementRes = await fetch(
  `${new URL(req.url).origin}/api/student/entitlements?mobile=${encodeURIComponent(mobile)}`,
  { cache: "no-store" }
);
const ent = await entitlementRes.json();

if (!entitlementRes.ok || !ent?.ok) {
  return NextResponse.json(
    { error: "Unable to verify entitlement for lesson audio." },
    { status: 500 }
  );
}

if (!ent.features?.lessonAudio) {
  return NextResponse.json(
    { error: "Full lesson audio is available for paid or override access only." },
    { status: 403 }
  );
}

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
