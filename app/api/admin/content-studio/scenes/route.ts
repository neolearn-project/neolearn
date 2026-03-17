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

const lower = (v?: string) => String(v || "").toLowerCase();

function isHindi(language: string) {
  return lower(language) === "hindi";
}

function isBengali(language: string) {
  return lower(language) === "bengali";
}

function tr(language: string, en: string, hi: string, bn: string) {
  if (isHindi(language)) return hi;
  if (isBengali(language)) return bn;
  return en;
}

function topicContains(topic: string, patterns: RegExp) {
  return patterns.test(lower(topic));
}

function fixedDiagramType(params: {
  family: TopicFamily;
  topic: string;
  type: Exclude<SceneType, "brand-intro">;
  title?: string;
  subtitle?: string;
  subject: string;
}) {
  const { family, topic, type, title, subtitle, subject } = params;
  const text = `${subject} ${topic} ${title || ""} ${subtitle || ""}`.toLowerCase();

  if (family === "geometry") {
    if (/triangle|triangles/.test(text)) {
      if (type === "title") return "geometry-hook";
      if (type === "concept") return "triangle-types";
      if (type === "example") return "triangle-labels";
      if (type === "recap") return "triangle-compare";
      return "brand-cta";
    }

    if (/symmetry|line of symmetry|reflection|mirror/.test(text)) {
      if (type === "title") return "geometry-hook";
      if (type === "concept") return "symmetry-line";
      if (type === "example") return "mirror-half";
      if (type === "recap") return "symmetric-vs-not";
      return "brand-cta";
    }

    if (/circle/.test(text)) {
      if (type === "title") return "geometry-hook";
      if (type === "concept") return "circle-parts";
      if (type === "example") return "circle-sectors";
      if (type === "recap") return "shape-compare";
      return "brand-cta";
    }
  }

  return diagramForScene({ family, topic, subject, type, title, subtitle });
}

function localizedSceneDefaults(
  type: Exclude<SceneType, "brand-intro">,
  topic: string,
  language: string,
  family: TopicFamily
) {
  if (type === "title") {
    return {
      title: topic,
      subtitle: hookSubtitle(language),
      lines: [
        topic,
        tr(language, "Easy explanation", "आसान समझ", "সহজ ব্যাখ্যা"),
        tr(language, "Quick understanding", "जल्दी समझें", "দ্রুত বোঝো"),
      ],
      durationMs: 4200,
      visualKind: "hook" as const,
      animationStyle: "build" as const,
    };
  }

  if (type === "concept") {
    if (family === "geometry" && /triangle|triangles/.test(lower(topic))) {
      return {
        title: tr(language, `What are ${topic}?`, `${topic} क्या हैं?`, `${topic} কী?`),
        subtitle: tr(
          language,
          "See how triangles differ by sides",
          "देखें, भुजाओं के आधार पर त्रिभुज कैसे अलग होते हैं",
          "দেখো, বাহুর ভিত্তিতে ত্রিভুজ কীভাবে আলাদা হয়"
        ),
        lines: [
          tr(language, "Three-sided shape", "तीन भुजाओं वाली आकृति", "তিন বাহুর আকার"),
          tr(language, "Sides can be equal or different", "भुजाएँ समान या अलग हो सकती हैं", "বাহু সমান বা ভিন্ন হতে পারে"),
          tr(language, "Type depends on shape", "प्रकार आकार पर निर्भर करता है", "ধরন আকারের উপর নির্ভর করে"),
        ],
        durationMs: 6200,
        visualKind: "concept" as const,
        animationStyle: "highlight" as const,
      };
    }

    return {
      title: tr(language, `What is ${topic}?`, `${topic} क्या है?`, `${topic} কী?`),
      subtitle: tr(language, "Understand the core idea", "मूल विचार समझें", "মূল ধারণা বুঝো"),
      lines: [
        tr(language, "Core idea", "मुख्य विचार", "মূল ধারণা"),
        tr(language, "Simple steps", "सरल चरण", "সহজ ধাপ"),
        tr(language, "Clear understanding", "स्पष्ट समझ", "স্পষ্ট বোঝাপড়া"),
      ],
      durationMs: 6200,
      visualKind: "concept" as const,
      animationStyle: "highlight" as const,
    };
  }

  if (type === "example") {
    if (family === "geometry" && /triangle|triangles/.test(lower(topic))) {
      return {
        title: tr(language, "Triangle Example", "त्रिभुज उदाहरण", "ত্রিভুজ উদাহরণ"),
        subtitle: tr(
          language,
          "Label the sides and base clearly",
          "भुजाओं और आधार को साफ़ देखें",
          "বাহু ও ভিত্তি পরিষ্কারভাবে দেখো"
        ),
        lines: [
          tr(language, "Top vertex", "ऊपरी शीर्ष", "উপরের শীর্ষবিন্দু"),
          tr(language, "Two slant sides", "दो तिरछी भुजाएँ", "দুই ঢালু বাহু"),
          tr(language, "Bottom base", "नीचे आधार", "নিচের ভিত্তি"),
        ],
        durationMs: 6800,
        visualKind: "example" as const,
        animationStyle: "transform" as const,
      };
    }

    return {
      title: tr(language, "Example", "उदाहरण", "উদাহরণ"),
      subtitle: tr(language, "See it with a quick example", "इसे एक आसान उदाहरण से देखें", "সহজ উদাহরণে দেখো"),
      lines: [
        tr(language, "Simple example", "सरल उदाहरण", "সহজ উদাহরণ"),
        tr(language, "Step by step", "चरण दर चरण", "ধাপে ধাপে"),
        tr(language, "Easy to remember", "आसानी से याद रखें", "সহজে মনে রাখো"),
      ],
      durationMs: 6800,
      visualKind: "example" as const,
      animationStyle: "transform" as const,
    };
  }

  if (type === "recap") {
    if (family === "geometry" && /triangle|triangles/.test(lower(topic))) {
      return {
        title: tr(language, "Quick Recap", "झटपट पुनरावृत्ति", "দ্রুত রিভিশন"),
        subtitle: tr(
          language,
          "Compare triangle types quickly",
          "त्रिभुज के प्रकार जल्दी से दोहराएँ",
          "ত্রিভুজের ধরন দ্রুত মিলিয়ে দেখো"
        ),
        lines: [
          tr(language, "All equal sides", "सभी भुजाएँ समान", "সব বাহু সমান"),
          tr(language, "Two equal sides", "दो भुजाएँ समान", "দুই বাহু সমান"),
          tr(language, "All sides different", "सभी भुजाएँ अलग", "সব বাহু ভিন্ন"),
        ],
        durationMs: 5200,
        visualKind: "recap" as const,
        animationStyle: "highlight" as const,
      };
    }

    return {
      title: tr(language, "Quick Recap", "झटपट पुनरावृत्ति", "দ্রুত রিভিশন"),
      subtitle: tr(language, "Remember the key points", "मुख्य बातें याद रखें", "মূল পয়েন্ট মনে রাখো"),
      lines: [
        tr(language, "Understand", "समझें", "বোঝো"),
        tr(language, "See example", "उदाहरण देखें", "উদাহরণ দেখো"),
        tr(language, "Practice", "अभ्यास करें", "অনুশীলন করো"),
      ],
      durationMs: 5200,
      visualKind: "recap" as const,
      animationStyle: "highlight" as const,
    };
  }

  return {
    title: "NeoLearn",
    subtitle: tr(language, "Learn Smarter", "स्मार्ट तरीके से सीखें", "স্মার্টভাবে শেখো"),
    lines: [
      tr(language, "Learn", "सीखें", "শিখো"),
      tr(language, "Practice", "अभ्यास", "অনুশীলন"),
      tr(language, "Track Progress", "प्रगति देखें", "অগ্রগতি দেখো"),
    ],
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
  const defaults = localizedSceneDefaults(type, topic, language, family);

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

  const diagramType = fixedDiagramType({
    family,
    topic,
    type,
    title,
    subtitle,
    subject,
  });

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
        voiceover:
          type === "title"
            ? tr(
                language,
                `Today we will learn ${topic} in a simple and visual way.`,
                `आज हम ${topic} को आसान और दृश्य तरीके से समझेंगे।`,
                `আজ আমরা ${topic} সহজ এবং ভিজ্যুয়াল পদ্ধতিতে শিখব।`
              )
            : type === "concept"
              ? tr(
                  language,
                  `${topic} becomes easier when the main idea is explained clearly step by step.`,
                  `${topic} को समझने के लिए पहले इसके मूल विचार को स्पष्ट रूप से समझना ज़रूरी है।`,
                  `${topic} ভালোভাবে শিখতে হলে আগে এর মূল ধারণা পরিষ্কারভাবে বুঝতে হবে।`
                )
              : type === "example"
                ? tr(
                    language,
                    `Now let us look at a simple example so that ${topic} becomes easier to understand and remember.`,
                    `अब एक आसान उदाहरण देखते हैं जिससे ${topic} और अच्छी तरह समझ आए।`,
                    `এবার একটি সহজ উদাহরণ দেখি যাতে ${topic} আরও পরিষ্কারভাবে বোঝা যায়।`
                  )
                : type === "recap"
                  ? tr(
                      language,
                      `To learn ${topic}, first understand the idea, then see an example, and finally practice it well.`,
                      `${topic} सीखने के लिए विचार समझना, उदाहरण देखना और अभ्यास करना ज़रूरी है।`,
                      `${topic} শিখতে হলে ধারণা, উদাহরণ আর অনুশীলন — এই ধাপগুলো গুরুত্বপূর্ণ।`
                    )
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
- Keep voiceover natural for teacher narration.
- Keep onscreenText to exactly 3 short lines.
- labels max 4 short items.
- emphasisWords max 4 short items.
- animationStyle only one of: build, highlight, transform, flow.
- Prefer topic-specific visuals over generic placeholders.
- For geometry topics, choose specific geometry diagram types.
- For triangle topics, use triangle-specific visuals, not generic concept cards.
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