import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey:
    process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "",
});

export async function POST(req: NextRequest) {
  try {
    if (!client.apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key is missing on the server." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const scriptText: string =
      body?.scriptText ||
      "Hi, I am your NeoLearn maths teacher. Today is a short demo lesson.";

    // 1) (Optional) You could generate a nicer script with GPT here.
    // For now we just use the scriptText sent from the frontend.

    // 2) Turn the script into audio using OpenAI TTS
    const speech = await client.audio.speech.create({
      model: "gpt-4o-mini-tts", // adjust if your account uses a slightly different name
      voice: "alloy",
      input: scriptText,
    });

    const audioBuffer = Buffer.from(await speech.arrayBuffer());
    const audioBase64 = audioBuffer.toString("base64");

    return NextResponse.json(
      {
        ok: true,
        text: scriptText,
        audioBase64, // frontend will play this as an <audio> source
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Avatar lesson error:", err?.response?.data || err);

    return NextResponse.json(
      {
        error:
          err?.response?.data?.error ||
          err?.message ||
          "Failed to generate lesson audio.",
      },
      { status: 500 }
    );
  }
}
