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

function sceneDefaults(type: Exclude<SceneType, "brand-intro">, topic: string, language: string) {
  if (type === "title") {
    return {
      title: topic,
      subtitle: hookSubtitle(language),
      lines: [topic, "Easy explanation", "Quick understanding"],
      durationMs: 4200,
      visualKind: "hook" as const,
      animationStyle: "build" as const,
    };
  }

  if (type === "concept") {
    return {
      title: `What is ${topic}?`,
      subtitle: "Understand the core idea",
      lines: ["Core idea", "Simple steps", "Clear understanding"],
      durationMs: 6200,
      visualKind: "concept" as const,
      animationStyle: "highlight" as const,
    };
  }

  if (type === "example") {
    return {
      title: "Example",
      subtitle: "See it with a quick example",
      lines: ["Simple example", "Step by step", "Easy to remember"],
      durationMs: 6800,
      visualKind: "example" as const,
      animationStyle: "transform" as const,
    };
  }

  if (type === "recap") {
    return {
      title: "Quick Recap",
      subtitle: "Remember the key points",
      lines: ["Understand", "See example", "Practice"],
      durationMs: 5200,
      visualKind: "recap" as const,
      animationStyle: "highlight" as const,
    };
  }

  return {
    title: "NeoLearn",
    subtitle: "Learn Smarter",
    lines: ["Learn", "Practice", "Track Progress"],
    durationMs: 3600,
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

  const visualIntent: VisualIntent = {
    diagramType:
      typeof raw?.visualIntent?.diagramType === "string" && raw.visualIntent.diagramType.trim()
        ? raw.visualIntent.diagramType.trim()
        : diagramForScene({ family, topic, subject, type, title, subtitle }),
    labels: Array.isArray(raw?.visualIntent?.labels)
      ? raw.visualIntent.labels
          .filter((x: unknown) => typeof x === "string")
          .map((x: string) => x.trim())
          .filter(Boolean)
          .slice(0, 4)
      : onscreenText,
    emphasisWords: Array.isArray(raw?.visualIntent?.emphasisWords)
      ? raw.visualIntent.emphasisWords
          .filter((x: unknown) => typeof x === "string")
          .map((x: string) => x.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [topic],
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
    durationMs:
      Number.isFinite(Number(raw?.durationMs)) && Number(raw.durationMs) > 0
        ? Number(raw.durationMs)
        : defaults.durationMs,
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
}) {
  const { subject, topic, ctaText, videoStyle, language, family } = params;

  const introScene: Scene = {
    sceneNo: 0,
    type: "brand-intro",
    title: "NeoLearn",
    subtitle: "The Future of Learning",
    voiceover: "",
    onscreenText: ["NeoLearn", "The Future of Learning", "AI Teachers for Every Child"],
    durationMs: 2200,
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
        title: undefined,
        subtitle: undefined,
        voiceover:
          type === "title"
            ? language.toLowerCase() === "hindi"
              ? `आज हम ${topic} को आसान और दृश्य तरीके से समझेंगे।`
              : language.toLowerCase() === "bengali"
                ? `আজ আমরা ${topic} সহজ এবং ভিজ্যুয়াল পদ্ধতিতে শিখব।`
                : `Today we will learn ${topic} in a simple, visual and easy way.`
            : type === "concept"
              ? language.toLowerCase() === "hindi"
                ? `${topic} को समझने के लिए पहले इसके मूल विचार को साफ़ तरीके से समझना ज़रूरी है।`
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

  return [introScene, ...contentScenes];
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
      return NextResponse.json({ ok: false, error: "Topic and script are required." }, { status: 400 });
    }

    const family = detectTopicFamily(subject, topic);

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
- Keep voiceover natural for teacher narration.
- Keep onscreenText to exactly 3 short lines.
- labels max 4 short items.
- emphasisWords max 4 short items.
- animationStyle only one of: build, highlight, transform, flow.
- For diagrams, prefer topic-specific visuals over generic cards.
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
      durationMs: 2200,
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
          }).slice(1);

    const finalScenes: Scene[] = [introScene, ...contentScenes];

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