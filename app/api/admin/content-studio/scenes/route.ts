import { NextResponse } from "next/server";
import OpenAI from "openai";
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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const board = String(body?.board || "CBSE").trim();
    const classId = String(body?.classId || "6").trim();
    const subject = String(body?.subject || "Mathematics").trim();
    const topic = String(body?.topic || "").trim();
    const language = String(body?.language || "English").trim();
    const durationSec = Number(body?.durationSec || 60);
    const videoStyle = String(body?.videoStyle || "whiteboard").trim();
    const ctaText = String(body?.ctaText || "Start your NeoLearn free trial today").trim();
    const thumbnailTitle = String(body?.thumbnailTitle || "").trim();

    if (!topic) {
      return NextResponse.json({ ok: false, error: "Topic is required." }, { status: 400 });
    }

    const systemPrompt = `
You are creating a short educational teaching video script for NeoLearn Admin Content Studio.

Rules:
- Make the script attractive, clear, and video-friendly.
- Keep it suitable for Indian students.
- The script must fit within approximately ${durationSec} seconds.
- Tone should be teacher-like, energetic, warm, and professional.
- The script should work well for a slide-based teaching video.
- Do not include production notes.
- Do not mention timestamps.
- Keep sentences short and narration-friendly.

Structure:
1. Topic hook
2. Simple explanation
3. One or two examples
4. Quick recap
5. CTA ending

Language: ${language}
Board: ${board}
Class: ${classId}
Subject: ${subject}
Video style: ${videoStyle}
CTA: ${ctaText}
`.trim();

    const userPrompt = `
Create a short teaching video script for this topic:

Topic: ${topic}
Thumbnail title: ${thumbnailTitle || topic}

The output must be plain narration script only.
`.trim();

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const script = (response.output_text || "").trim();

    if (!script) {
      return NextResponse.json(
        { ok: false, error: "OpenAI returned empty script." },
        { status: 500 }
      );
    }

    const supabase = getSupabase();
    let jobId: number | null = null;

    if (supabase) {
      const { data, error } = await supabase
        .from("content_studio_jobs")
        .insert({
          status: "script_generated",
          board,
          class_id: classId,
          subject,
          topic,
          language,
          duration_sec: durationSec,
          video_style: videoStyle,
          cta_text: ctaText,
          thumbnail_title: thumbnailTitle,
          script_text: script,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (!error && data?.id) {
        jobId = data.id;
      }
    }

    return NextResponse.json({
      ok: true,
      script,
      jobId,
    });
  } catch (e: any) {
    console.error("content-studio script error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Script generation failed." },
      { status: 500 }
    );
  }
}