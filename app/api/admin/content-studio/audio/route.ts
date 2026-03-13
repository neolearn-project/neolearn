import { NextResponse } from "next/server";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const topic = String(body?.topic || "").trim();
    const language = String(body?.language || "English").trim();
    const scenes = Array.isArray(body?.scenes) ? body.scenes : [];
    const jobId = body?.jobId ? Number(body.jobId) : null;

    if (!topic || scenes.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Topic and scenes are required." },
        { status: 400 }
      );
    }

   type StudioScene = {
  type?: string;
  voiceover?: string;
};

const narrationText = (scenes as StudioScene[])
  .filter((scene: StudioScene) => scene?.type !== "brand-intro")
  .map((scene: StudioScene) => String(scene?.voiceover || "").trim())
  .filter(Boolean)
  .join("\n\n");

    if (!narrationText) {
      return NextResponse.json(
        { ok: false, error: "No narration text found in scenes." },
        { status: 400 }
      );
    }

    const instructions =
      language.toLowerCase() === "hindi"
        ? "Speak clearly in simple Hindi for Indian school students. Warm teacher voice."
        : language.toLowerCase() === "bengali"
        ? "Speak clearly in simple Bengali for Indian school students. Warm teacher voice."
        : "Speak clearly in simple English for Indian school students. Warm teacher voice.";

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      response_format: "mp3",
      input: narrationText,
      instructions,
    });

    const buffer = Buffer.from(await speech.arrayBuffer());

    const outDir = path.join(process.cwd(), "public", "generated", "audio");
    ensureDir(outDir);

    const safeTopic = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const fileName = `content-studio-${jobId || Date.now()}-${safeTopic}.mp3`;
    const filePath = path.join(outDir, fileName);

    fs.writeFileSync(filePath, buffer);

    const audioUrl = `/generated/audio/${fileName}`;

    const supabase = getSupabase();
    if (supabase && jobId) {
      await supabase
        .from("content_studio_jobs")
        .update({
          status: "audio_generated",
          audio_url: audioUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    return NextResponse.json({
      ok: true,
      audioUrl,
      narrationText,
    });
  } catch (e: any) {
    console.error("content-studio audio error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Audio generation failed." },
      { status: 500 }
    );
  }
}