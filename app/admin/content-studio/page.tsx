"use client";

import { useState } from "react";

type Scene = {
  sceneNo: number;
  type: "brand-intro" | "title" | "concept" | "example" | "recap" | "cta";
  title?: string;
  subtitle?: string;
  voiceover: string;
  onscreenText: string[];
  durationMs: number;
  visualStyle: "whiteboard" | "premium-slide";
  visualKind?: "hook" | "concept" | "example" | "recap";
};

export default function AdminContentStudioPage() {
  const [form, setForm] = useState({
    board: "CBSE",
    classId: "6",
    subject: "Mathematics",
    topic: "",
    language: "English",
    durationSec: "60",
    videoStyle: "whiteboard",
    ctaText: "Start your NeoLearn free trial today",
    thumbnailTitle: "",
  });

  const [loadingScript, setLoadingScript] = useState(false);
  const [loadingScenes, setLoadingScenes] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [loadingRender, setLoadingRender] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [script, setScript] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [audioUrl, setAudioUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [jobId, setJobId] = useState<number | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleGenerateScript() {
    setMsg(null);
    setLoadingScript(true);
    setScript("");
    setScenes([]);
    setAudioUrl("");
    setVideoUrl("");
    setJobId(null);

    try {
      const res = await fetch("/api/admin/content-studio/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board: form.board,
          classId: form.classId,
          subject: form.subject,
          topic: form.topic.trim(),
          language: form.language,
          durationSec: Number(form.durationSec),
          videoStyle: form.videoStyle,
          ctaText: form.ctaText.trim(),
          thumbnailTitle: form.thumbnailTitle.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to generate script.");
      }

      setScript(data.script || "");
      setJobId(data.jobId || null);
      setMsg("Script generated.");
    } catch (e: any) {
      setMsg(e?.message || "Failed to generate script.");
    } finally {
      setLoadingScript(false);
    }
  }

  async function handleGenerateScenes() {
    setMsg(null);
    setLoadingScenes(true);
    setAudioUrl("");
    setVideoUrl("");

    try {
      const res = await fetch("/api/admin/content-studio/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board: form.board,
          classId: form.classId,
          subject: form.subject,
          topic: form.topic.trim(),
          language: form.language,
          durationSec: Number(form.durationSec),
          videoStyle: form.videoStyle,
          ctaText: form.ctaText.trim(),
          script,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to generate scenes.");
      }

      setScenes(Array.isArray(data.scenes) ? data.scenes : []);
      setMsg("Scenes generated.");
    } catch (e: any) {
      setMsg(e?.message || "Failed to generate scenes.");
    } finally {
      setLoadingScenes(false);
    }
  }

  async function handleGenerateAudio() {
    setMsg(null);
    setLoadingAudio(true);
    setVideoUrl("");

    try {
      const res = await fetch("/api/admin/content-studio/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          topic: form.topic.trim(),
          language: form.language,
          scenes,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to generate audio.");
      }

      setAudioUrl(data.audioUrl || "");
      setMsg("Audio generated.");
    } catch (e: any) {
      setMsg(e?.message || "Failed to generate audio.");
    } finally {
      setLoadingAudio(false);
    }
  }

  async function handleRenderVideo() {
    setMsg(null);
    setLoadingRender(true);

    try {
      if (!jobId) {
        throw new Error("No job found. Generate script first.");
      }

      const res = await fetch("/api/admin/content-studio/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to render video.");
      }

      setVideoUrl(data.videoUrl || "");
      setMsg("Video rendered successfully.");
    } catch (e: any) {
      setMsg(e?.message || "Failed to render video.");
    } finally {
      setLoadingRender(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Content Studio</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate branded NeoLearn teaching videos from topic inputs.
        </p>
      </div>

      {msg && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          {msg}
        </div>
      )}

      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Video Inputs</h2>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <select
            value={form.board}
            onChange={(e) => update("board", e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="CBSE">CBSE</option>
            <option value="TBSE">TBSE</option>
            <option value="ICSE">ICSE</option>
          </select>

          <select
            value={form.classId}
            onChange={(e) => update("classId", e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            {["6", "7", "8", "9", "10", "11", "12"].map((c) => (
              <option key={c} value={c}>
                Class {c}
              </option>
            ))}
          </select>

          <input
            value={form.subject}
            onChange={(e) => update("subject", e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Subject"
          />

          <input
            value={form.topic}
            onChange={(e) => update("topic", e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm md:col-span-2"
            placeholder="Topic"
          />

          <select
            value={form.language}
            onChange={(e) => update("language", e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="English">English</option>
            <option value="Hindi">Hindi</option>
            <option value="Bengali">Bengali</option>
          </select>

          <select
            value={form.durationSec}
            onChange={(e) => update("durationSec", e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="30">30 sec</option>
            <option value="60">60 sec</option>
            <option value="120">120 sec</option>
          </select>

          <select
            value={form.videoStyle}
            onChange={(e) => update("videoStyle", e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="whiteboard">Whiteboard</option>
            <option value="premium-slide">Premium Slide</option>
          </select>

          <input
            value={form.thumbnailTitle}
            onChange={(e) => update("thumbnailTitle", e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Thumbnail title"
          />

          <input
            value={form.ctaText}
            onChange={(e) => update("ctaText", e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm md:col-span-2"
            placeholder="CTA text"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleGenerateScript}
            disabled={loadingScript}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {loadingScript ? "Generating script..." : "Generate Script"}
          </button>

          <button
            type="button"
            onClick={handleGenerateScenes}
            disabled={loadingScenes || !script.trim()}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loadingScenes ? "Generating scenes..." : "Generate Scenes"}
          </button>

          <button
            type="button"
            onClick={handleGenerateAudio}
            disabled={loadingAudio || scenes.length === 0}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loadingAudio ? "Generating audio..." : "Generate Audio"}
          </button>

          <button
            type="button"
            onClick={handleRenderVideo}
            disabled={loadingRender || !jobId || scenes.length === 0}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loadingRender ? "Rendering video..." : "Render Trial Video"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Generated Script</h2>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            className="min-h-[420px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Generated script will appear here"
          />
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Generated Scenes</h2>
          <pre className="min-h-[420px] overflow-auto rounded-xl bg-slate-50 p-3 text-xs">
            {JSON.stringify(scenes, null, 2)}
          </pre>
        </div>
      </div>

      {audioUrl && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold">Generated Audio</h2>
          <audio controls className="w-full" src={audioUrl} />
          <a
            href={audioUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Open Audio File
          </a>
        </div>
      )}

      {videoUrl && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold">Rendered Video</h2>
          <video controls className="w-full rounded-xl" src={videoUrl} />
          <a
            href={videoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Open Video File
          </a>
        </div>
      )}
    </section>
  );
}