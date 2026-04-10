import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import {
  defaultCtaVoice,
  detectTopicFamily,
  diagramForScene,
  hookSubtitle,
  type TopicFamily,
} from "@/lib/content-studio/videoTaxonomy";

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

type VisualIntent = {
  diagramType?: string;
  labels?: string[];
  emphasisWords?: string[];
  animationStyle?: "build" | "highlight" | "transform" | "flow";
};

type SceneType = "brand-intro" | "title" | "concept" | "example" | "recap" | "cta";
type VisualKind = "hook" | "concept" | "example" | "recap";

type Scene = {
  sceneNo: number;
  type: SceneType;
  title?: string;
  subtitle?: string;
  voiceover?: string;
  onscreenText?: string[];
  durationMs: number;
  visualStyle?: "whiteboard" | "premium-slide";
  visualKind?: VisualKind;
  visualIntent?: VisualIntent;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function countWords(text?: string) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function estimateVoiceoverDurationMs(text?: string, type?: SceneType) {
  const words = countWords(text);

  if (!words) {
    if (type === "title") return 4800;
    if (type === "concept") return 7600;
    if (type === "example") return 8200;
    if (type === "recap") return 6200;
    if (type === "cta") return 5200;
    return 4200;
  }

  const msPerWord = 430;
  const basePause =
    type === "title"
      ? 1500
      : type === "concept"
        ? 1800
        : type === "example"
          ? 1900
          : type === "recap"
            ? 1700
            : type === "cta"
              ? 1600
              : 1500;

  const estimated = words * msPerWord + basePause;

  const minDuration =
    type === "title"
      ? 4800
      : type === "concept"
        ? 7000
        : type === "example"
          ? 7600
          : type === "recap"
            ? 5600
            : type === "cta"
              ? 4800
              : 4200;

  const maxDuration =
    type === "title"
      ? 9000
      : type === "concept"
        ? 15000
        : type === "example"
          ? 16000
          : type === "recap"
            ? 11000
            : type === "cta"
              ? 9000
              : 8000;

  return clamp(Math.round(estimated), minDuration, maxDuration);
}

function stretchScenesToTarget(scenes: Scene[], durationSec: number) {
  const targetTotalMs = Math.max(30000, durationSec * 1000);
  const currentTotalMs = scenes.reduce((sum, scene) => sum + scene.durationMs, 0);

  if (currentTotalMs >= targetTotalMs) {
    return scenes;
  }

  const extraNeeded = targetTotalMs - currentTotalMs;

  const weights: Record<SceneType, number> = {
    "brand-intro": 0.2,
    title: 0.9,
    concept: 1.5,
    example: 1.8,
    recap: 1.1,
    cta: 0.8,
  };

  const totalWeight = scenes.reduce((sum, scene) => sum + (weights[scene.type] || 1), 0);

  let distributed = 0;

  return scenes.map((scene, index) => {
    const rawAdd = Math.round((extraNeeded * (weights[scene.type] || 1)) / totalWeight);
    const add =
      index === scenes.length - 1 ? extraNeeded - distributed : rawAdd;

    distributed += add;

    return {
      ...scene,
      durationMs: scene.durationMs + add,
    };
  });
}

function sceneDefaults(type: Exclude<SceneType, "brand-intro">, topic: string, language: string) {
  if (type === "title") {
    return {
      title: topic,
      subtitle: hookSubtitle(language),
      lines: [topic, "Easy explanation", "Quick understanding"],
      durationMs: 5200,
      visualKind: "hook" as const,
      animationStyle: "build" as const,
    };
  }

  if (type === "concept") {
    return {
      title: `What is ${topic}?`,
      subtitle: "Understand the core idea",
      lines: ["Core idea", "Simple steps", "Clear understanding"],
      durationMs: 7600,
      visualKind: "concept" as const,
      animationStyle: "highlight" as const,
    };
  }

  if (type === "example") {
    return {
      title: "Example",
      subtitle: "See it with a quick example",
      lines: ["Simple example", "Step by step", "Easy to remember"],
      durationMs: 8200,
      visualKind: "example" as const,
      animationStyle: "transform" as const,
    };
  }

  if (type === "recap") {
    return {
      title: "Quick Recap",
      subtitle: "Remember the key points",
      lines: ["Understand", "See example", "Practice"],
      durationMs: 6200,
      visualKind: "recap" as const,
      animationStyle: "highlight" as const,
    };
  }

  return {
    title: "NeoLearn",
    subtitle: "Learn Smarter",
    lines: ["Learn", "Practice", "Track Progress"],
    durationMs: 5200,
    visualKind: "recap" as const,
    animationStyle: "build" as const,
  };
}

function normalizeScene(params: {
  raw: any;
  index: number;
  topic: string;
  subject: string;
  language: string;
  ctaText: string;
  family: TopicFamily;
  videoStyle: "whiteboard" | "premium-slide";
}): Scene {
  const { raw, index, topic, subject, language, ctaText, family, videoStyle } = params;

  const order: Exclude<SceneType, "brand-intro">[] = ["title", "concept", "example", "recap", "cta"];
  const type = order[index];
  const defaults = sceneDefaults(type, topic, language);

  const title =
    typeof raw?.title === "string" && raw.title.trim() ? raw.title.trim() : defaults.title;

  const subtitle =
    typeof raw?.subtitle === "string" && raw.subtitle.trim() ? raw.subtitle.trim() : defaults.subtitle;

  const voiceover =
    typeof raw?.voiceover === "string" && raw.voiceover.trim()
      ? raw.voiceover.trim()
      : type === "cta"
        ? defaultCtaVoice(language, ctaText)
        : "";

  const onscreenText = Array.isArray(raw?.onscreenText)
    ? raw.onscreenText
        .filter((x: unknown) => typeof x === "string")
        .map((x: string) => x.trim())
        .filter(Boolean)
        .slice(0, 3)
    : defaults.lines;

  const diagramType =
    typeof raw?.visualIntent?.diagramType === "string" && raw.visualIntent.diagramType.trim()
      ? raw.visualIntent.diagramType.trim()
      : diagramForScene({ family, topic, subject, type, title, subtitle });

  const labels = Array.isArray(raw?.visualIntent?.labels)
    ? raw.visualIntent.labels
        .filter((x: unknown) => typeof x === "string")
        .map((x: string) => x.trim())
        .filter(Boolean)
        .slice(0, 4)
    : onscreenText;

  const emphasisWords = Array.isArray(raw?.visualIntent?.emphasisWords)
    ? raw.visualIntent.emphasisWords
        .filter((x: unknown) => typeof x === "string")
        .map((x: string) => x.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [topic, subject];

  const estimatedDurationMs = estimateVoiceoverDurationMs(voiceover, type);
  const rawDurationMs =
    Number.isFinite(Number(raw?.durationMs)) && Number(raw.durationMs) > 0
      ? Number(raw.durationMs)
      : 0;

  const visualIntent: VisualIntent = {
    diagramType,
    labels,
    emphasisWords,
    animationStyle:
      raw?.visualIntent?.animationStyle === "build" ||
      raw?.visualIntent?.animationStyle === "highlight" ||
      raw?.visualIntent?.animationStyle === "transform" ||
      raw?.visualIntent?.animationStyle === "flow"
        ? raw.visualIntent.animationStyle
        : defaults.animationStyle,
  };

  return {
    sceneNo: index + 1,
    type,
    title,
    subtitle,
    voiceover,
    onscreenText: onscreenText.length ? onscreenText : defaults.lines,
    durationMs: Math.max(defaults.durationMs, rawDurationMs, estimatedDurationMs),
    visualStyle: videoStyle,
    visualKind: defaults.visualKind,
    visualIntent,
  };
}

function buildFallbackScenes(params: {
  subject: string;
  topic: string;
  ctaText: string;
  videoStyle: "whiteboard" | "premium-slide";
  language: string;
  family: TopicFamily;
  durationSec: number;
}) {
  const { subject, topic, ctaText, videoStyle, language, family, durationSec } = params;

  const introScene: Scene = {
    sceneNo: 0,
    type: "brand-intro",
    title: "NeoLearn",
    subtitle: "The Future of Learning",
    voiceover: "",
    onscreenText: ["NeoLearn", "The Future of Learning", "AI Teachers for Every Child"],
    durationMs: 2600,
    visualStyle: videoStyle,
    visualIntent: {
      diagramType: "brand-intro",
      labels: ["NeoLearn"],
      emphasisWords: ["The Future of Learning"],
      animationStyle: "build",
    },
  };

  const contentScenes: Scene[] = ["title", "concept", "example", "recap", "cta"].map((type, index) =>
    normalizeScene({
      raw: {
        voiceover:
          type === "title"
            ? language.toLowerCase() === "hindi"
              ? `आज हम ${topic} को आसान और दृश्य तरीके से समझेंगे।`
              : language.toLowerCase() === "bengali"
                ? `আজ আমরা ${topic} সহজ এবং ভিজ্যুয়াল পদ্ধতিতে শিখব।`
                : `Today we will learn ${topic} in a simple, visual and easy way.`
            : type === "concept"
              ? language.toLowerCase() === "hindi"
                ? `${topic} को समझने के लिए पहले इसके मूल विचार को स्पष्ट रूप से समझना ज़रूरी है।`
                : language.toLowerCase() === "bengali"
                  ? `${topic} ভালোভাবে শিখতে হলে আগে এর মূল ধারণা পরিষ্কারভাবে বুঝতে হবে।`
                  : `${topic} becomes easier when the main idea is explained clearly step by step.`
              : type === "example"
                ? language.toLowerCase() === "hindi"
                  ? `अब एक आसान उदाहरण देखते हैं जिससे ${topic} और अच्छी तरह समझ आए।`
                  : language.toLowerCase() === "bengali"
                    ? `এবার একটি সহজ উদাহরণ দেখি যাতে ${topic} আরও পরিষ্কারভাবে বোঝা যায়।`
                    : `Now let us look at a simple example so that ${topic} becomes easier to understand and remember.`
                : type === "recap"
                  ? language.toLowerCase() === "hindi"
                    ? `${topic} सीखने के लिए विचार समझना, उदाहरण देखना और अभ्यास करना ज़रूरी है।`
                    : language.toLowerCase() === "bengali"
                      ? `${topic} শিখতে হলে ধারণা, উদাহরণ আর অনুশীলন — এই ধাপগুলো গুরুত্বপূর্ণ।`
                      : `To learn ${topic}, first understand the idea, then see an example, and finally practice it well.`
                  : defaultCtaVoice(language, ctaText),
      },
      index,
      topic,
      subject,
      language,
      ctaText,
      family,
      videoStyle,
    })
  );

  return stretchScenesToTarget([introScene, ...contentScenes], durationSec);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const jobId = Number(body?.jobId || 0);
    const board = String(body?.board || "CBSE").trim();
    const classId = String(body?.classId || "6").trim();
    const subject = String(body?.subject || "Mathematics").trim();
    const topic = String(body?.topic || "").trim();
    const language = String(body?.language || "English").trim();
    const durationSec = Number(body?.durationSec || 60);
    const videoStyle =
      String(body?.videoStyle || "whiteboard").trim() === "premium-slide"
        ? "premium-slide"
        : "whiteboard";
    const ctaText = String(body?.ctaText || "Start your NeoLearn free trial today").trim();
    const script = String(body?.script || "").trim();

    if (!topic || !script) {
      return NextResponse.json(
        { ok: false, error: "Topic and script are required." },
        { status: 400 }
      );
    }

    const family = detectTopicFamily(subject, topic, script);

    const systemPrompt = `
You are creating 5 short-form educational video scenes for NeoLearn.

Return JSON array only.
No markdown.
Exactly 5 scenes.
Scene order:
1 title
2 concept
3 example
4 recap
5 cta

For every scene include:
sceneNo, type, title, subtitle, voiceover, onscreenText, durationMs, visualStyle, visualKind, visualIntent

visualKind must be:
title=hook
concept=concept
example=example
recap=recap
cta=recap

visualIntent must include:
diagramType, labels, emphasisWords, animationStyle

Topic family: ${family}
Board: ${board}
Class: ${classId}
Subject: ${subject}
Topic: ${topic}
Language: ${language}
Duration target: ${durationSec} seconds

Rules:
- Must fit the real topic exactly.
- Hook scene must feel social-media ready.
- Concept scene must explain clearly.
- Example scene must be visual and practical.
- Recap scene must be punchy.
- CTA must feel premium and clean.
- Keep voiceover natural for teacher narration.
- Keep onscreenText to exactly 3 short lines.
- labels max 4 short items.
- emphasisWords max 4 short items.
- animationStyle only one of: build, highlight, transform, flow.
- Prefer topic-specific visuals over generic placeholders.
- Use stronger hook wording for short-form video.
- Give realistic durationMs based on voiceover so the video does not end too early.
`.trim();

    const userPrompt = `
CTA: ${ctaText}

Script:
${script}
`.trim();

    let aiScenes: any[] = [];

    try {
      const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const raw = (response.output_text || "").trim();

      try {
        aiScenes = JSON.parse(raw);
      } catch {
        aiScenes = [];
      }
    } catch {
      aiScenes = [];
    }

    const introScene: Scene = {
      sceneNo: 0,
      type: "brand-intro",
      title: "NeoLearn",
      subtitle: "The Future of Learning",
      voiceover: "",
      onscreenText: ["NeoLearn", "The Future of Learning", "AI Teachers for Every Child"],
      durationMs: 2600,
      visualStyle: videoStyle,
      visualIntent: {
        diagramType: "brand-intro",
        labels: ["NeoLearn"],
        emphasisWords: ["The Future of Learning"],
        animationStyle: "build",
      },
    };

    const contentScenes =
      Array.isArray(aiScenes) && aiScenes.length >= 5
        ? aiScenes.slice(0, 5).map((raw, index) =>
            normalizeScene({
              raw,
              index,
              topic,
              subject,
              language,
              ctaText,
              family,
              videoStyle,
            })
          )
        : buildFallbackScenes({
            subject,
            topic,
            ctaText,
            videoStyle,
            language,
            family,
            durationSec,
          }).slice(1);

    const finalScenes = stretchScenesToTarget([introScene, ...contentScenes], durationSec);

    const supabase = getSupabase();
    if (supabase) {
      const updatePayload = {
        status: "scenes_generated",
        scenes_json: finalScenes,
        updated_at: new Date().toISOString(),
      };

      if (jobId > 0) {
        await supabase.from("content_studio_jobs").update(updatePayload).eq("id", jobId);
      } else {
        await supabase.from("content_studio_jobs").update(updatePayload).eq("topic", topic);
      }
    }

    return NextResponse.json({
      ok: true,
      scenes: finalScenes,
      family,
    });
  } catch (e: any) {
    console.error("content-studio scenes error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Scene generation failed." },
      { status: 500 }
    );
  }
}