import { NextResponse } from "next/server";
import OpenAI from "openai";
import { OwnershipError, ownershipErrorResponse, requireStudentMobile } from "@/lib/auth/ownership";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

function normalizeLanguage(language: string) {
  const v = String(language || "English").toLowerCase();

  if (v === "hi" || v.includes("hindi")) {
    return {
      label: "Hindi",
      instruction:
        "एक स्पष्ट, मधुर और आत्मीय भारतीय महिला स्कूल टीचर की तरह स्वाभाविक हिंदी में बोलें। आवाज साफ, crisp और friendly हो। बच्चों को समझाने वाली classroom-style Hindi का प्रयोग करें। केवल जरूरी academic terms के अलावा अनावश्यक English न मिलाएं।",
    };
  }

  if (v === "bn" || v.includes("bengali") || v.includes("bangla")) {
    return {
      label: "Bengali",
      instruction:
        "একজন স্পষ্ট, মিষ্টি এবং বন্ধুসুলভ ভারতীয় মহিলা স্কুল টিচারের মতো স্বাভাবিক বাংলায় বলুন। কণ্ঠস্বর পরিষ্কার, crisp এবং ছাত্রছাত্রীদের বোঝার মতো হোক। Bengali classroom style ব্যবহার করুন। জরুরি academic term ছাড়া অপ্রয়োজনীয় English মেশাবেন না।",
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
    instruction:
      "Use natural Indian English pronunciation and the familiar cadence of an Indian school classroom.",
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
    await requireStudentMobile(req, mobile);

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
      {
        cache: "no-store",
        headers: {
          cookie: req.headers.get("cookie") || "",
          authorization: req.headers.get("authorization") || "",
        },
      }
    );

    const entText = await entitlementRes.text();
    let ent: any = null;

    try {
      ent = entText ? JSON.parse(entText) : null;
    } catch {
      ent = null;
    }

    const isVercelPreviewAuthBlock =
      process.env.VERCEL_ENV === "preview" &&
      entText.includes("Authentication Required") &&
      entText.includes("Vercel Authentication");

    if (!entitlementRes.ok || !ent?.ok) {
      console.error("lesson-audio entitlement failed:", {
        status: entitlementRes.status,
        body: entText.slice(0, 500),
        vercelEnv: process.env.VERCEL_ENV || null,
      });

      if (!isVercelPreviewAuthBlock) {
        return NextResponse.json(
          {
            error: "Unable to verify entitlement for lesson audio.",
            details: entText || null,
          },
          { status: 500 }
        );
      }
    }

    const hasLessonAudio =
      isVercelPreviewAuthBlock || Boolean(ent?.features?.lessonAudio);

    if (!hasLessonAudio) {
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
      "Speak as NeoLearn's warm, clear, feminine Indian school teacher.",
      lang.instruction,
      "Use a distinctly feminine vocal character with crisp articulation, clear pronunciation, and a friendly classroom tone.",
      "Keep a confident, caring, natural pace that Class 6 to 12 students can follow easily; do not speak too slowly.",
      "Sound conversational and human, never robotic, dull, foreign-accented, sing-song, or overly dramatic.",
      "Do not add extra content beyond the given lesson text.",
    ].join(" ");

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "shimmer",
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
    if (err instanceof OwnershipError) return ownershipErrorResponse(err);
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
