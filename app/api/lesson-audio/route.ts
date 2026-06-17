import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

function normalizeLanguage(language: string) {
  const v = String(language || "English").toLowerCase();

  if (v === "hi" || v.includes("hindi")) {
    return {
      label: "Hindi",
      instruction: "Speak in clear, child-friendly Hindi. Use simple Hindi words.",
    };
  }

  if (v === "bn" || v.includes("bengali") || v.includes("bangla")) {
    return {
      label: "Bengali",
      instruction: "Speak in clear, child-friendly Bengali. Use simple Bengali words.",
    };
  }

  if (v === "sa" || v.includes("sanskrit")) {
    return {
      label: "Sanskrit",
      instruction: "Speak in simple English with Sanskrit terms pronounced clearly. Do not overcomplicate.",
    };
  }

  return {
    label: "English",
    instruction: "Speak in clear, child-friendly Indian English.",
  };
}

function normalizeSpeed(speed: string) {
  const v = String(speed || "Normal").toLowerCase();
  if (v.includes("slow")) return 0.9;
  if (v.includes("fast")) return 1.15;
  return 1.0;
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY for lesson audio." },
        { status: 500 }
      );
    }

    const body = await req.json();

    const mobile = String(body.mobile || body.studentMobile || "").trim();
    const rawText = String(body.text || body.lessonText || body.answer || "").trim();
    const languageRaw = String(body.language || body.lang || "English");
    const speedRaw = String(body.speed || "Normal");

    if (!mobile) {
      return NextResponse.json(
        { error: "Missing mobile field for lesson audio." },
        { status: 400 }
      );
    }

    if (!rawText) {
      return NextResponse.json(
        { error: "Missing text field for lesson audio." },
        { status: 400 }
      );
    }

    const safeText =
      rawText.length > 3800
        ? rawText.slice(0, 3800) +
          "\n\nThis is the first part of the lesson audio. Please continue reading the remaining text on screen."
        : rawText;

    const entitlementRes = await fetch(
      `${new URL(req.url).origin}/api/student/entitlements?mobile=${encodeURIComponent(mobile)}`,
      { cache: "no-store" }
    );

    const entText = await entitlementRes.text();
    let ent: any = null;

    try {
      ent = entText ? JSON.parse(entText) : null;
    } catch {
      ent = null;
    }

    if (!entitlementRes.ok || !ent?.ok) {
      console.error("lesson-audio entitlement failed:", {
        status: entitlementRes.status,
        body: entText,
      });

      return NextResponse.json(
        {
          error: "Unable to verify entitlement for lesson audio.",
          details: entText || null,
        },
        { status: 500 }
      );
    }

    if (!ent.features?.lessonAudio) {
      return NextResponse.json(
        {
          error: "Full lesson audio is available for paid or override access only.",
          plan: ent.plan || null,
          features: ent.features || null,
        },
        { status: 403 }
      );
    }

    const lang = normalizeLanguage(languageRaw);
    const ttsSpeed = normalizeSpeed(speedRaw);

    const instructions = [
      "You are NeoLearn's friendly school teacher.",
      lang.instruction,
      "Speak slowly and clearly for a school student.",
      "Use a warm classroom tone.",
      "Do not add extra content beyond the given lesson text.",
    ].join(" ");

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      response_format: "mp3",
      input: safeText,
      instructions,
      speed: ttsSpeed,
    });

    const audioBuffer = Buffer.from(await speech.arrayBuffer());

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Content-Length": String(audioBuffer.length),
      },
    });
  } catch (err: any) {
    console.error("TTS generation error:", {
      message: err?.message,
      status: err?.status,
      code: err?.code,
      type: err?.type,
    });

    return NextResponse.json(
      {
        error: "Audio generation failed",
        details: err?.message || String(err),
        status: err?.status || null,
        code: err?.code || null,
      },
      { status: 500 }
    );
  }
}
