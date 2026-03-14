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

function detectTopicFamily(subject: string, topic: string) {
  const text = `${subject} ${topic}`.toLowerCase();

  if (
    /triangle|triangles|angle|angles|polygon|circle|quadrilateral|geometry|line|segment|perimeter|area/.test(
      text
    )
  ) {
    return "geometry";
  }

  if (/fraction|fractions|numerator|denominator|equivalent fraction|half|quarter/.test(text)) {
    return "fractions";
  }

  if (/algebra|equation|variable|expression|polynomial|linear/.test(text)) {
    return "algebra";
  }

  if (/photosynthesis|plant|plants|cell|cells|respiration|leaf|biology|science/.test(text)) {
    return "biology";
  }

  if (/force|motion|gravity|speed|velocity|energy|physics/.test(text)) {
    return "physics";
  }

  if (/atom|molecule|element|compound|acid|base|reaction|chemistry/.test(text)) {
    return "chemistry";
  }

  if (/noun|pronoun|verb|adjective|tense|grammar|sentence|english/.test(text)) {
    return "grammar";
  }

  if (/history|empire|king|revolution|freedom|civilization|ancient/.test(text)) {
    return "history";
  }

  if (/map|river|mountain|plateau|climate|continent|geography/.test(text)) {
    return "geography";
  }

  return "general";
}

function getDiagramType(topicFamily: string) {
  switch (topicFamily) {
    case "geometry":
      return "shape-diagram";
    case "fractions":
      return "fraction-model";
    case "algebra":
      return "equation-steps";
    case "biology":
      return "process-flow";
    case "physics":
      return "motion-force";
    case "chemistry":
      return "reaction-structure";
    case "grammar":
      return "text-breakdown";
    case "history":
      return "timeline";
    case "geography":
      return "map-concept";
    default:
      return "concept-card";
  }
}

function getHookSubtitle(language: string) {
  const l = language.toLowerCase();
  if (l === "hindi") return "आसान और तेज़ सीखना";
  if (l === "bengali") return "সহজ ও দ্রুত শেখা";
  return "Simple, visual and easy to learn";
}

function getCtaVoiceover(language: string, ctaText: string) {
  const l = language.toLowerCase();
  if (ctaText?.trim()) return ctaText.trim();
  if (l === "hindi") return "NeoLearn के साथ स्मार्ट तरीके से सीखना शुरू करें।";
  if (l === "bengali") return "NeoLearn-এর সাথে স্মার্টভাবে শেখা শুরু করো।";
  return "Start learning smarter with NeoLearn.";
}

function buildFallbackScenes(params: {
  subject: string;
  topic: string;
  ctaText: string;
  videoStyle: "whiteboard" | "premium-slide";
  language: string;
}) {
  const { subject, topic, ctaText, videoStyle, language } = params;
  const topicFamily = detectTopicFamily(subject, topic);
  const diagramType = getDiagramType(topicFamily);
  const isHindi = language.toLowerCase() === "hindi";
  const isBengali = language.toLowerCase() === "bengali";

  if (isHindi) {
    return [
      {
        sceneNo: 0,
        type: "brand-intro",
        title: "NeoLearn",
        subtitle: "The Future of Learning",
        voiceover: "",
        onscreenText: ["NeoLearn", "The Future of Learning", "AI Teachers for Every Child"],
        durationMs: 2200,
        visualStyle: videoStyle,
      },
      {
        sceneNo: 1,
        type: "title",
        title: `${topic}`,
        subtitle: getHookSubtitle(language),
        voiceover: `आज हम ${topic} को आसान और दृश्य तरीके से समझेंगे।`,
        onscreenText: [topic, "आसान व्याख्या", "जल्दी समझें"],
        durationMs: 4200,
        visualStyle: videoStyle,
        visualKind: "hook",
        visualIntent: {
          diagramType,
          labels: [topic],
          emphasisWords: [topic],
          animationStyle: "build",
        },
      },
      {
        sceneNo: 2,
        type: "concept",
        title: `${topic} क्या है?`,
        subtitle: "मुख्य विचार को समझें",
        voiceover: `${topic} को समझने के लिए पहले इसके मूल विचार को साफ़ तरीके से समझना ज़रूरी है।`,
        onscreenText: ["मुख्य विचार", "सरल चरण", "स्पष्ट समझ"],
        durationMs: 6200,
        visualStyle: videoStyle,
        visualKind: "concept",
        visualIntent: {
          diagramType,
          labels: ["मुख्य विचार", "सरल समझ"],
          emphasisWords: [topic],
          animationStyle: "highlight",
        },
      },
      {
        sceneNo: 3,
        type: "example",
        title: "उदाहरण",
        subtitle: "एक छोटे उदाहरण से समझें",
        voiceover: `अब एक आसान उदाहरण देखते हैं जिससे ${topic} और भी अच्छी तरह समझ आए।`,
        onscreenText: ["सरल उदाहरण", "चरण-दर-चरण", "आसानी से याद रखें"],
        durationMs: 6800,
        visualStyle: videoStyle,
        visualKind: "example",
        visualIntent: {
          diagramType,
          labels: ["उदाहरण", "समझ"],
          emphasisWords: [topic],
          animationStyle: "transform",
        },
      },
      {
        sceneNo: 4,
        type: "recap",
        title: "Quick Recap",
        subtitle: "मुख्य बातें याद रखें",
        voiceover: `${topic} सीखने के लिए मुख्य बात है विचार समझना, उदाहरण देखना और फिर अभ्यास करना।`,
        onscreenText: ["विचार समझें", "उदाहरण देखें", "अभ्यास करें"],
        durationMs: 5200,
        visualStyle: videoStyle,
        visualKind: "recap",
        visualIntent: {
          diagramType,
          labels: ["Recap"],
          emphasisWords: ["अभ्यास", "समझ"],
          animationStyle: "highlight",
        },
      },
      {
        sceneNo: 5,
        type: "cta",
        title: "NeoLearn",
        subtitle: "Learn Smarter",
        voiceover: getCtaVoiceover(language, ctaText),
        onscreenText: ["Learn", "Practice", "Track Progress"],
        durationMs: 3600,
        visualStyle: videoStyle,
        visualIntent: {
          diagramType: "brand-cta",
          labels: ["NeoLearn"],
          emphasisWords: ["Learn", "Practice"],
          animationStyle: "build",
        },
      },
    ] satisfies Scene[];
  }

  if (isBengali) {
    return [
      {
        sceneNo: 0,
        type: "brand-intro",
        title: "NeoLearn",
        subtitle: "The Future of Learning",
        voiceover: "",
        onscreenText: ["NeoLearn", "The Future of Learning", "AI Teachers for Every Child"],
        durationMs: 2200,
        visualStyle: videoStyle,
      },
      {
        sceneNo: 1,
        type: "title",
        title: `${topic}`,
        subtitle: getHookSubtitle(language),
        voiceover: `আজ আমরা ${topic} সহজ এবং ভিজ্যুয়াল পদ্ধতিতে শিখব।`,
        onscreenText: [topic, "সহজ ব্যাখ্যা", "দ্রুত বুঝুন"],
        durationMs: 4200,
        visualStyle: videoStyle,
        visualKind: "hook",
        visualIntent: {
          diagramType,
          labels: [topic],
          emphasisWords: [topic],
          animationStyle: "build",
        },
      },
      {
        sceneNo: 2,
        type: "concept",
        title: `${topic} কী?`,
        subtitle: "মূল ধারণা বুঝে নাও",
        voiceover: `${topic} ভালোভাবে শিখতে হলে আগে এর মূল ধারণা পরিষ্কারভাবে বুঝতে হবে।`,
        onscreenText: ["মূল ধারণা", "সহজ ধাপ", "পরিষ্কার বোঝাপড়া"],
        durationMs: 6200,
        visualStyle: videoStyle,
        visualKind: "concept",
        visualIntent: {
          diagramType,
          labels: ["মূল ধারণা", "সহজ বোঝা"],
          emphasisWords: [topic],
          animationStyle: "highlight",
        },
      },
      {
        sceneNo: 3,
        type: "example",
        title: "উদাহরণ",
        subtitle: "ছোট উদাহরণ দিয়ে বুঝি",
        voiceover: `এবার একটি সহজ উদাহরণ দেখি যাতে ${topic} আরও পরিষ্কারভাবে বোঝা যায়।`,
        onscreenText: ["সহজ উদাহরণ", "ধাপে ধাপে", "সহজে মনে রাখো"],
        durationMs: 6800,
        visualStyle: videoStyle,
        visualKind: "example",
        visualIntent: {
          diagramType,
          labels: ["উদাহরণ", "বোঝা"],
          emphasisWords: [topic],
          animationStyle: "transform",
        },
      },
      {
        sceneNo: 4,
        type: "recap",
        title: "Quick Recap",
        subtitle: "মূল পয়েন্টগুলো মনে রাখো",
        voiceover: `${topic} শিখতে হলে প্রথমে ধারণা, তারপর উদাহরণ, তারপর অনুশীলন — এই ধাপগুলো গুরুত্বপূর্ণ।`,
        onscreenText: ["ধারণা বোঝো", "উদাহরণ দেখো", "অনুশীলন করো"],
        durationMs: 5200,
        visualStyle: videoStyle,
        visualKind: "recap",
        visualIntent: {
          diagramType,
          labels: ["Recap"],
          emphasisWords: ["অনুশীলন", "বোঝা"],
          animationStyle: "highlight",
        },
      },
      {
        sceneNo: 5,
        type: "cta",
        title: "NeoLearn",
        subtitle: "Learn Smarter",
        voiceover: getCtaVoiceover(language, ctaText),
        onscreenText: ["Learn", "Practice", "Track Progress"],
        durationMs: 3600,
        visualStyle: videoStyle,
        visualIntent: {
          diagramType: "brand-cta",
          labels: ["NeoLearn"],
          emphasisWords: ["Learn", "Practice"],
          animationStyle: "build",
        },
      },
    ] satisfies Scene[];
  }

  return [
    {
      sceneNo: 0,
      type: "brand-intro",
      title: "NeoLearn",
      subtitle: "The Future of Learning",
      voiceover: "",
      onscreenText: ["NeoLearn", "The Future of Learning", "AI Teachers for Every Child"],
      durationMs: 2200,
      visualStyle: videoStyle,
    },
    {
      sceneNo: 1,
      type: "title",
      title: topic,
      subtitle: getHookSubtitle(language),
      voiceover: `Today we will learn ${topic} in a simple, visual and easy way.`,
      onscreenText: [topic, "Easy explanation", "Quick understanding"],
      durationMs: 4200,
      visualStyle: videoStyle,
      visualKind: "hook",
      visualIntent: {
        diagramType,
        labels: [topic],
        emphasisWords: [topic],
        animationStyle: "build",
      },
    },
    {
      sceneNo: 2,
      type: "concept",
      title: `What is ${topic}?`,
      subtitle: "Understand the core idea",
      voiceover: `${topic} becomes easier when the main idea is explained clearly step by step.`,
      onscreenText: ["Core idea", "Simple steps", "Clear understanding"],
      durationMs: 6200,
      visualStyle: videoStyle,
      visualKind: "concept",
      visualIntent: {
        diagramType,
        labels: ["Core idea", "Simple explanation"],
        emphasisWords: [topic],
        animationStyle: "highlight",
      },
    },
    {
      sceneNo: 3,
      type: "example",
      title: "Example",
      subtitle: "See it with a quick example",
      voiceover: `Now let us look at a simple example so that ${topic} becomes easier to understand and remember.`,
      onscreenText: ["Simple example", "Step by step", "Easy to remember"],
      durationMs: 6800,
      visualStyle: videoStyle,
      visualKind: "example",
      visualIntent: {
        diagramType,
        labels: ["Example", "Visual understanding"],
        emphasisWords: [topic],
        animationStyle: "transform",
      },
    },
    {
      sceneNo: 4,
      type: "recap",
      title: "Quick Recap",
      subtitle: "Remember the key points",
      voiceover: `To learn ${topic}, first understand the idea, then see an example, and finally practice it well.`,
      onscreenText: ["Understand", "See example", "Practice"],
      durationMs: 5200,
      visualStyle: videoStyle,
      visualKind: "recap",
      visualIntent: {
        diagramType,
        labels: ["Recap"],
        emphasisWords: ["Practice", "Understand"],
        animationStyle: "highlight",
      },
    },
    {
      sceneNo: 5,
      type: "cta",
      title: "NeoLearn",
      subtitle: "Learn Smarter",
      voiceover: getCtaVoiceover(language, ctaText),
      onscreenText: ["Learn", "Practice", "Track Progress"],
      durationMs: 3600,
      visualStyle: videoStyle,
      visualIntent: {
        diagramType: "brand-cta",
        labels: ["NeoLearn"],
        emphasisWords: ["Learn", "Practice"],
        animationStyle: "build",
      },
    },
  ] satisfies Scene[];
}

function normalizeScene(
  raw: any,
  index: number,
  topic: string,
  videoStyle: "whiteboard" | "premium-slide",
  topicFamily: string,
  language: string,
  ctaText: string
): Scene {
  const diagramType = getDiagramType(topicFamily);
  const sceneOrder: SceneType[] = ["title", "concept", "example", "recap", "cta"];
  const visualOrder: VisualKind[] = ["hook", "concept", "example", "recap", "recap"];

  const type = sceneOrder[index] || "concept";
  const visualKind = visualOrder[index] || "concept";

  const safeTitle =
    typeof raw?.title === "string" && raw.title.trim()
      ? raw.title.trim()
      : type === "title"
        ? topic
        : type === "cta"
          ? "NeoLearn"
          : type === "example"
            ? "Example"
            : type === "recap"
              ? "Quick Recap"
              : `What is ${topic}?`;

  const safeSubtitle =
    typeof raw?.subtitle === "string"
      ? raw.subtitle.trim()
      : type === "title"
        ? getHookSubtitle(language)
        : "";

  const safeVoiceover =
    typeof raw?.voiceover === "string" && raw.voiceover.trim()
      ? raw.voiceover.trim()
      : type === "cta"
        ? getCtaVoiceover(language, ctaText)
        : "";

  const safeOnscreenText = Array.isArray(raw?.onscreenText)
    ? raw.onscreenText
        .filter((x: unknown) => typeof x === "string")
        .map((x: string) => x.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const defaultOnscreen =
    type === "title"
      ? [topic, "Easy explanation", "Quick understanding"]
      : type === "concept"
        ? ["Core idea", "Simple steps", "Clear understanding"]
        : type === "example"
          ? ["Simple example", "Step by step", "Easy to remember"]
          : type === "recap"
            ? ["Understand", "See example", "Practice"]
            : ["Learn", "Practice", "Track Progress"];

  const safeDuration =
    Number.isFinite(Number(raw?.durationMs)) && Number(raw.durationMs) > 0
      ? Number(raw.durationMs)
      : type === "title"
        ? 4200
        : type === "concept"
          ? 6200
          : type === "example"
            ? 6800
            : type === "recap"
              ? 5200
              : 3600;

  const safeVisualIntent: VisualIntent = {
    diagramType:
      typeof raw?.visualIntent?.diagramType === "string" && raw.visualIntent.diagramType.trim()
        ? raw.visualIntent.diagramType.trim()
        : type === "cta"
          ? "brand-cta"
          : diagramType,
    labels: Array.isArray(raw?.visualIntent?.labels)
      ? raw.visualIntent.labels
          .filter((x: unknown) => typeof x === "string")
          .map((x: string) => x.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [],
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
        : type === "example"
          ? "transform"
          : type === "concept"
            ? "highlight"
            : "build",
  };

  return {
    sceneNo: index + 1,
    type,
    title: safeTitle,
    subtitle: safeSubtitle,
    voiceover: safeVoiceover,
    onscreenText: safeOnscreenText.length ? safeOnscreenText : defaultOnscreen,
    durationMs: safeDuration,
    visualStyle: videoStyle,
    visualKind,
    visualIntent: safeVisualIntent,
  };
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

    const topicFamily = detectTopicFamily(subject, topic);
    const diagramType = getDiagramType(topicFamily);

    const systemPrompt = `
You are converting a teaching video script into structured scene JSON for NeoLearn Content Studio.

Your goal is to create short-form educational promo scenes that feel premium, visual, and social-media ready.

Rules:
- Output a JSON array only.
- Never return markdown.
- Never return an empty array.
- Create exactly 5 non-intro scenes.
- Use these scene types in order:
  title, concept, example, recap, cta
- Use these visualKind values in order:
  hook, concept, example, recap, recap
- Each scene must include:
  sceneNo, type, title, subtitle, voiceover, onscreenText, durationMs, visualStyle, visualKind, visualIntent
- visualIntent must include:
  diagramType, labels, emphasisWords, animationStyle
- onscreenText must contain exactly 3 short lines.
- labels should be 1 to 4 short labels.
- emphasisWords should be 1 to 4 strong words or phrases.
- animationStyle must be one of:
  build, highlight, transform, flow

Creative goals:
- The title scene must act like a social-media hook.
- The concept scene must explain clearly.
- The example scene must feel visual and practical.
- The recap scene must be punchy and memorable.
- The CTA scene must be brand-safe and short.

Topic family: ${topicFamily}
Suggested diagram type: ${diagramType}
Language: ${language}
Subject: ${subject}
Topic: ${topic}

Important:
- Make the content fit the actual topic exactly.
- Do not use fraction examples unless the topic is fractions.
- Do not use geometry examples unless the topic is geometry.
- Make titles and subtitles attractive for short-form video.
- Keep narration clean and natural for teacher voice.
- Keep scene durations realistic for short-form social media.
- Total tone should feel premium, educational, clear, and modern.
`.trim();

    const userPrompt = `
Board: ${board}
Class: ${classId}
Subject: ${subject}
Topic: ${topic}
Language: ${language}
Video style: ${videoStyle}
Duration target: ${durationSec} seconds
CTA: ${ctaText}
Topic family: ${topicFamily}
Suggested diagram type: ${diagramType}

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

    const validAiScenes = Array.isArray(aiScenes) ? aiScenes.filter(Boolean).slice(0, 5) : [];

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
      validAiScenes.length === 5
        ? validAiScenes.map((scene, index) =>
            normalizeScene(scene, index, topic, videoStyle, topicFamily, language, ctaText)
          )
        : buildFallbackScenes({
            subject,
            topic,
            ctaText,
            videoStyle,
            language,
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
      topicFamily,
      diagramType,
    });
  } catch (e: any) {
    console.error("content-studio scenes error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Scene generation failed." },
      { status: 500 }
    );
  }
}