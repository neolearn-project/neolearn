import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { spawn } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase env missing.");
  }
  return createClient(supabaseUrl, supabaseKey);
}

export async function POST(req: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { ok: false, error: "Video rendering is enabled only in local admin for now." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const jobId = Number(body?.jobId || 0);

    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "Missing jobId." },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data: job, error } = await supabase
      .from("content_studio_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { ok: false, error: error?.message || "Job not found." },
        { status: 404 }
      );
    }

    const payload = JSON.stringify({
      jobId,
      topic: job.topic || "Untitled Topic",
      ctaText: job.cta_text || "Start your NeoLearn free trial today",
      audioUrl: job.audio_url || null,
      bgMusicUrl: "/audio/bg-edtech-soft.mp3",
      scenes: Array.isArray(job.scenes_json) ? job.scenes_json : [],
    });

    if (!job.scenes_json || !Array.isArray(job.scenes_json) || job.scenes_json.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No scenes found for this job." },
        { status: 400 }
      );
    }

    const scriptPath = path.join(process.cwd(), "scripts", "render-neolearn-video.cjs");

    const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>(
      (resolve) => {
        const child = spawn(process.execPath, [scriptPath, payload], {
          cwd: process.cwd(),
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (d) => {
          stdout += d.toString();
        });

        child.stderr.on("data", (d) => {
          stderr += d.toString();
        });

        child.on("close", (code) => {
          resolve({ stdout, stderr, code });
        });
      }
    );

    if (result.code !== 0) {
      console.error("Render child stderr:", result.stderr);
      return NextResponse.json(
        { ok: false, error: result.stderr || "Render failed." },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(result.stdout);

    await supabase
      .from("content_studio_jobs")
      .update({
        status: "video_rendered",
        video_url: parsed.publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return NextResponse.json({
      ok: true,
      videoUrl: parsed.publicUrl,
      outputLocation: parsed.outputLocation,
    });
  } catch (e: any) {
    console.error("content-studio render error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Render failed." },
      { status: 500 }
    );
  }
}