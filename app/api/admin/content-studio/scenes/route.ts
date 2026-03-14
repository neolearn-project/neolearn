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

function buildFallbackScenes(params: {
  topic: string;
  ctaText: string;
  videoStyle: "whiteboard" | "premium-slide";
  language: string;
}) {
  const { topic, ctaText, videoStyle, language } = params;

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
        onscreenText: [
          "NeoLearn",
          "The Future of Learning",
          "AI Teachers for Every Child"
        ],
        durationMs: 6200,
        visualStyle: videoStyle
      },
      {
        sceneNo: 1,
        type: "title",
        title: `${topic}`,
        subtitle: "सरल और आसान समझ",
        voiceover: `आज हम ${topic} को बहुत आसान तरीके से समझेंगे।`,
        onscreenText: [
          `${topic}`,
          "आसान भाषा में",
          "छोटे उदाहरणों के साथ"
        ],
        durationMs: 6500,
        visualStyle: videoStyle,
        visualKind: "hook"
      },
      {
        sceneNo: 2,
        type: "concept",
        title: `${topic} क्या है?`,
        subtitle: "मूल विचार को समझें",
        voiceover: `${topic} का मतलब है किसी विचार को आसान तरीके से समझना और रोज़मर्रा के उदाहरणों से सीखना।`,
        onscreenText: [
          "मुख्य विचार समझें",
          "सरल उदाहरण देखें",
          "एक-एक कदम में सीखें"
        ],
        durationMs: 7000,
        visualStyle: videoStyle,
        visualKind: "concept"
      },
      {
        sceneNo: 3,
        type: "example",
        title: "उदाहरण",
        subtitle: "वास्तविक जीवन से जोड़कर",
        voiceover: `अब एक छोटा उदाहरण लेते हैं ताकि ${topic} और भी आसानी से समझ आए।`,
        onscreenText: [
          "सरल उदाहरण",
          "आसानी से याद रखें",
          "प्रयोग करके समझें"
        ],
        durationMs: 7000,
        visualStyle: videoStyle,
        visualKind: "example"
      },
      {
        sceneNo: 4,
        type: "recap",
        title: "Quick Recap",
        subtitle: "मुख्य बातों को याद रखें",
        voiceover: `${topic} को समझने के लिए मुख्य बात यह है कि पहले विचार समझें, फिर उदाहरण देखें, और फिर अभ्यास करें।`,
        onscreenText: [
          "विचार समझें",
          "उदाहरण देखें",
          "अभ्यास करें"
        ],
        durationMs: 6500,
        visualStyle: videoStyle,
        visualKind: "recap"
      },
      {
        sceneNo: 5,
        type: "cta",
        title: "NeoLearn",
        subtitle: "Learn Smarter",
        voiceover: ctaText || "NeoLearn के साथ स्मार्ट तरीके से सीखना शुरू करें।",
        onscreenText: [
          "Learn",
          "Practice",
          "Track Progress"
        ],
        durationMs: 5500,
        visualStyle: videoStyle
      }
    ];
  }

  if (isBengali) {
    return [
      {
        sceneNo: 0,
        type: "brand-intro",
        title: "NeoLearn",
        subtitle: "The Future of Learning",
        voiceover: "",
        onscreenText: [
          "NeoLearn",
          "The Future of Learning",
          "AI Teachers for Every Child"
        ],
        durationMs: 6200,
        visualStyle: videoStyle
      },
      {
        sceneNo: 1,
        type: "title",
        title: `${topic}`,
        subtitle: "সহজ এবং পরিষ্কার ব্যাখ্যা",
        voiceover: `আজ আমরা ${topic} খুব সহজভাবে শিখব।`,
        onscreenText: [
          `${topic}`,
          "সহজ ভাষায়",
          "ছোট উদাহরণসহ"
        ],
        durationMs: 6500,
        visualStyle: videoStyle,
        visualKind: "hook"
      },
      {
        sceneNo: 2,
        type: "concept",
        title: `${topic} কী?`,
        subtitle: "মূল ধারণা বুঝে নাও",
        voiceover: `${topic} শেখার জন্য আগে মূল ধারণা বুঝতে হবে, তারপর উদাহরণ দেখলে বিষয়টি আরও সহজ হবে।`,
        onscreenText: [
          "মূল ধারণা",
          "সহজ উদাহরণ",
          "ধাপে ধাপে শেখা"
        ],
        durationMs: 7000,
        visualStyle: videoStyle,
        visualKind: "concept"
      },
      {
        sceneNo: 3,
        type: "example",
        title: "উদাহরণ",
        subtitle: "বাস্তব জীবনের সাথে মিলিয়ে",
        voiceover: `এবার একটি ছোট উদাহরণ দেখি, যাতে ${topic} আরও সহজে বোঝা যায়।`,
        onscreenText: [
          "সহজ উদাহরণ",
          "বাস্তব জীবনের সাথে মিল",
          "সহজে মনে রাখো"
        ],
        durationMs: 7000,
        visualStyle: videoStyle,
        visualKind: "example"
      },
      {
        sceneNo: 4,
        type: "recap",
        title: "Quick Recap",
        subtitle: "মূল বিষয়গুলো মনে রাখো",
        voiceover: `${topic} বুঝতে হলে প্রথমে ধারণা, তারপর উদাহরণ, তারপর অনুশীলন — এই তিনটি ধাপ খুব গুরুত্বপূর্ণ।`,
        onscreenText: [
          "ধারণা বোঝো",
          "উদাহরণ দেখো",
          "অনুশীলন করো"
        ],
        durationMs: 6500,
        visualStyle: videoStyle,
        visualKind: "recap"
      },
      {
        sceneNo: 5,
        type: "cta",
        title: "NeoLearn",
        subtitle: "Learn Smarter",
        voiceover: ctaText || "NeoLearn-এর সাথে আরও সহজে শেখা শুরু করো।",
        onscreenText: [
          "Learn",
          "Practice",
          "Track Progress"
        ],
        durationMs: 5500,
        visualStyle: videoStyle
      }
    ];
  }

  return [
    {
      sceneNo: 0,
      type: "brand-intro",
      title: "NeoLearn",
      subtitle: "The Future of Learning",
      voiceover: "",
      onscreenText: [
        "NeoLearn",
        "The Future of Learning",
        "AI Teachers for Every Child"
      ],
      durationMs: 6200,
      visualStyle: videoStyle
    },
    {
      sceneNo: 1,
      type: "title",
      title: `${topic}`,
      subtitle: "Simple and clear explanation",
      voiceover: `Today we will learn ${topic} in a simple and easy way.`,
      onscreenText: [
        `${topic}`,
        "Easy explanation",
        "Quick understanding"
      ],
      durationMs: 6500,
      visualStyle: videoStyle,
      visualKind: "hook"
    },
    {
      sceneNo: 2,
      type: "concept",
      title: `What is ${topic}?`,
      subtitle: "Understand the core idea",
      voiceover: `${topic} becomes easier when we understand the main idea step by step.`,
      onscreenText: [
        "Understand the core idea",
        "See simple examples",
        "Learn step by step"
      ],
      durationMs: 7000,
      visualStyle: videoStyle,
      visualKind: "concept"
    },
    {
      sceneNo: 3,
      type: "example",
      title: "Example",
      subtitle: "Learn with a simple case",
      voiceover: `Now let us look at a simple example so that ${topic} becomes easy to remember.`,
      onscreenText: [
        "Simple example",
        "Easy to remember",
        "Practical understanding"
      ],
      durationMs: 7000,
      visualStyle: videoStyle,
      visualKind: "example"
    },
    {
      sceneNo: 4,
      type: "recap",
      title: "Quick Recap",
      subtitle: "Remember the key points",
      voiceover: `To learn ${topic}, first understand the idea, then look at examples, and finally practice.`,
      onscreenText: [
        "Understand the idea",
        "See examples",
        "Practice regularly"
      ],
      durationMs: 6500,
      visualStyle: videoStyle,
      visualKind: "recap"
    },
    {
      sceneNo: 5,
      type: "cta",
      title: "NeoLearn",
      subtitle: "Learn Smarter",
      voiceover: ctaText || "Start learning smarter with NeoLearn.",
      onscreenText: [
        "Learn",
        "Practice",
        "Track Progress"
      ],
      durationMs: 5500,
      visualStyle: videoStyle
    }
  ];
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

    const systemPrompt = `
You are converting a teaching video script into structured scene JSON for NeoLearn Content Studio.

Rules:
- Output a JSON array only.
- Never return an empty array.
- Create exactly 5 non-intro scenes.
- Use these scene types in order:
  title, concept, example, recap, cta
- Each scene must include:
  sceneNo, type, title, subtitle, voiceover, onscreenText, durationMs, visualStyle, visualKind
- onscreenText must contain 3 short lines.
- visualKind should be:
  hook, concept, example, recap, recap
- Make the language natural and suitable for ${language}.
- Keep narration clean and video-friendly.
- Do not include markdown.
`.trim();

    const userPrompt = `
Board: ${board}
Class: ${classId}
Subject: ${subject}
Topic: ${topic}
Language: ${language}
Video style: ${videoStyle}
Duration: ${durationSec} seconds
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
          { role: "user", content: userPrompt }
        ]
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

    const validAiScenes = Array.isArray(aiScenes) ? aiScenes.filter(Boolean) : [];

    const introScene = {
      sceneNo: 0,
      type: "brand-intro",
      title: "NeoLearn",
      subtitle: "The Future of Learning",
      voiceover: "",
      onscreenText: ["NeoLearn", "The Future of Learning", "AI Teachers for Every Child"],
      durationMs: 6200,
      visualStyle: videoStyle
    };

    const contentScenes =
      validAiScenes.length > 0
        ? validAiScenes.map((scene: any, index: number) => ({
            sceneNo: index + 1,
            type: scene?.type || "concept",
            title: scene?.title || topic,
            subtitle: scene?.subtitle || "",
            voiceover: scene?.voiceover || "",
            onscreenText: Array.isArray(scene?.onscreenText)
              ? scene.onscreenText.slice(0, 3)
              : [],
            durationMs: Number(scene?.durationMs || 6500),
            visualStyle: videoStyle,
            visualKind: scene?.visualKind || "concept"
          }))
        : buildFallbackScenes({
            topic,
            ctaText,
            videoStyle,
            language
          }).slice(1);

    const finalScenes = [introScene, ...contentScenes];

    const supabase = getSupabase();
    if (supabase) {
      await supabase
        .from("content_studio_jobs")
        .update({
          status: "scenes_generated",
          scenes_json: finalScenes,
          updated_at: new Date().toISOString()
        })
        .eq("topic", topic);
    }

    return NextResponse.json({
      ok: true,
      scenes: finalScenes
    });
  } catch (e: any) {
    console.error("content-studio scenes error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Scene generation failed." },
      { status: 500 }
    );
  }
}