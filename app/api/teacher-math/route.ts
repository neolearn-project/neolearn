import { NextResponse } from "next/server";
import OpenAI from "openai";
import Twilio from "twilio"; // (not used here, ignore if you don't want)
import { createClient } from "@supabase/supabase-js";

import {
  getTeacherConfig,
  BoardId,
  LangCode,
  ClassId,
  SubjectId,
} from "@/app/lib/teacherConfig";

import {
  decidePersona,
  buildPersonaInstruction,
  type PersonaProfile,
} from "@/app/lib/personaEngine";

// ------------------------
// Decide model based on question complexity
// ------------------------
function pickModel(question: string): string {
  const q = question.toLowerCase();
  const length = question.length;

  const heavyKeywords =
    /(prove|proof|derivative|integral|integration|trigonometry|physics|chemistry|why does|explain why)/;

  if (heavyKeywords.test(q) || length > 400) return "gpt-5.1";
  if (length < 120) return "gpt-5-nano";
  return "gpt-5-mini";
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.NEOLEARN_OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

import { supabaseAdminClient } from "@/app/lib/supabaseServer";

async function embedQuestion(client: OpenAI, text: string): Promise<number[]> {
  // 1536 dims (matches your vector(1536))
  const emb = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return emb.data[0].embedding;
}

export async function POST(req: Request) {
  try {
   const raw = await req.text();

if (!raw || !raw.trim()) {
  return NextResponse.json(
    { error: "Empty request body. Send JSON in POST body." },
    { status: 400 }
  );
}

let body: any;
try {
  body = JSON.parse(raw);
} catch {
  return NextResponse.json(
    { error: "Invalid JSON in request body." },
    { status: 400 }
  );
}

    // ------------------------
    // Inputs from UI
    // ------------------------
    const question = String(body?.question || "").trim();
    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const subjectId = (body?.subjectId || "maths") as SubjectId; // semantic
    const classId = ((body?.classId as string) || "6") as ClassId;
    const board = (body?.board as BoardId) || "cbse";
    const lang = (body?.lang as LangCode) || "en";
    const chapterId = (body?.chapterId as string) || "fractions";

    // DB ids used for memory match/save (text ids in your DB)
    const subjectDbId = String(body?.subjectDbId || "");
    const chapterDbId = String(body?.chapterDbId || "");
    const topicDbId = String(body?.topicDbId || "");
// âœ… Student identity
const studentMobile = String(body?.studentMobile || "").trim();

// Prefer Supabase Auth UID (recommended)
const studentId = String(body?.studentId || "").trim();

// legacy fallback (old UI may send topicId)
const topicId = String(body?.topicId || "").trim();


    const teacher = getTeacherConfig(subjectId, classId);
    const chapter =
      teacher.chapters.find((c) => c.id === chapterId) || teacher.chapters[0];

    const selectedSubjectName = String(
      body?.selectedSubject || body?.subject || teacher.displayName
    ).trim();

    const selectedChapterName = String(
      body?.selectedChapter || body?.chapter || chapter?.title || ""
    ).trim();

    const selectedTopicName = String(
      body?.selectedTopic || body?.topic || ""
    ).trim();

    const isRepeatRequest =
      /\b(repeat|again|explain again|describe again|explain it again|describe this chapter|cant understand|can't understand|cannot understand|i cant understand|i can't understand|didnt get|didn't get|did'nt get|did not get|not understand|did not understand|dont understand|don't understand|i dont understand|i don't understand|confused|ok|okay|samjha nahi|samajh nahi|samajh nehi|samajh me nahi|samajh me nehi|samajh me nahi aaya|samajh me nehi aaya|samajh mein nahi|samajh mein nehi|dobara|fir se|phir se)\b/i.test(question);

    
    const boardLabel =
      board === "icse"
        ? "ICSE (CISCE)"
        : board === "tbse"
        ? "TBSE / Tripura Board"
        : "CBSE (NCERT)";

    // HARD TOPIC LOCK: Lines and Angles -> Point
    // Prevents wrong interpretation as decimal point / place value.
    const qLowerForTopicLock = question.toLowerCase();
    const chapterLowerForTopicLock = selectedChapterName.toLowerCase();
    const topicLowerForTopicLock = selectedTopicName.toLowerCase();

    const isGenericConfusionOrRepeat =
      qLowerForTopicLock.includes("repeat") ||
      qLowerForTopicLock.includes("again") ||
      qLowerForTopicLock.includes("understand") ||
      qLowerForTopicLock.includes("confused") ||
      qLowerForTopicLock.includes("doubt") ||
      qLowerForTopicLock.includes("samajh") ||
      qLowerForTopicLock.includes("nahi") ||
      qLowerForTopicLock.includes("nehi");

    const isLinesAnglesPoint =
      chapterLowerForTopicLock.includes("line") &&
      chapterLowerForTopicLock.includes("angle") &&
      topicLowerForTopicLock.includes("point");

    if (isLinesAnglesPoint && isGenericConfusionOrRepeat) {
      const answer = [
        "Restating your doubt: You want me to explain Point again in Lines and Angles.",
        "",
        "A point is an exact position or location.",
        "We show a point by a small dot on paper.",
        "A point has no length, no breadth, and no height.",
        "It has no size. It only shows one exact place.",
        "We usually name a point with a capital letter like A, B, C, or P.",
        "",
        "Example 1:",
        "Draw a small dot on your notebook and write A beside it. This is point A.",
        "",
        "Example 2:",
        "Draw two dots and name them B and C. These are two different points. Later, we can join two points to make a line segment.",
        "",
        "Remember: this is a geometry point in Lines and Angles. It is not a decimal point.",
        "",
        "Follow-up question: Can you draw one dot and name it point P?"
      ].join("\n");

      return NextResponse.json(
        {
          answer,
          modelUsed: "rule-lines-angles-point",
          cached: false,
          source: "topic-lock",
          audio: null,
        },
        { status: 200 }
      );
    }


    // ------------------------
    // Clients
    // ------------------------
    const openai = getOpenAIClient();

    // DIRECT TOPIC LOCK FOR REPEAT / CONFUSION QUESTIONS
    // Bypasses memory/persona/weak-topic fallback to avoid wrong old chapters.
    if (selectedTopicName) {
      if (!openai) {
        return NextResponse.json(
          { error: "Teacher unavailable (missing OpenAI API key)." },
          { status: 500 }
        );
      }

      const directPrompt = `
You are a kind Indian school teacher.

The student is asking a doubt or response inside the current lesson. Answer only inside the selected subject, chapter, and topic.

STRICT CURRENT CONTEXT:
Subject: ${selectedSubjectName}
Chapter: ${selectedChapterName}
Topic: ${selectedTopicName}
Class: ${teacher.classId}
Board: ${boardLabel}

Student message: ${question}

Rules:
- SANSKRIT ACCURACY GUARD:
  If Subject is Sanskrit, keep Sanskrit examples grammatically correct.
  Do not convert Sanskrit forms into Hindi plural words.
  Explain meaning in simple Hindi or English, but examples must remain Sanskrit.
  For Sanskrit neuter noun examples, use:
  फलम् → फले → फलानि
  पुस्तकम् → पुस्तके → पुस्तकानि
  गृहम् → गृहे → गृहाणि
  पत्रम् → पत्रे → पत्राणि
  Never write doubtful mixed forms like "पुस्तकें?" when the correct Sanskrit form is "पुस्तके".
- Explain or respond ONLY about the selected topic above.
- Do NOT explain Knowing Our Numbers unless the selected topic/chapter is actually Knowing Our Numbers.
- Do NOT explain place value, face value, decimals, fractions, or number system unless that is the selected topic.
- Do NOT use old memory, old weak topic, or any previous lesson.
- If Subject is English, explain the selected story/literature topic only.
- If Subject is Science, explain the selected science topic only.
- If Subject is Sanskrit or Hindi, explain the selected grammar/literature topic only.
- Use simple child-friendly language.
- Start with: "Restating your doubt:"
- Then explain in 4 to 6 short steps.
- Give 1 or 2 examples from the selected topic.
- End with one follow-up question.
`.trim();

      const directResponse = await openai.responses.create({
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content:
              "You must obey the selected subject, chapter, and topic exactly. Never switch to another chapter. For Sanskrit, examples must use correct Sanskrit grammar forms and must not be converted into Hindi plural forms.",
          },
          {
            role: "user",
            content: directPrompt,
          },
        ],
      });

      const answer = String((directResponse as any).output_text || "").trim();

      return NextResponse.json(
        {
          answer:
            answer ||
            `Restating your doubt: You want me to explain ${selectedTopicName} again.\n\nThis topic belongs to ${selectedSubjectName}, chapter ${selectedChapterName}. Let us understand this same topic step by step.`,
          modelUsed: "direct-repeat-topic-lock",
          cached: false,
          source: "direct-topic-lock",
          audio: null,
        },
        { status: 200 }
      );
    }
    if (!openai) {
      return NextResponse.json(
        { error: "Teacher unavailable (missing OpenAI API key)." },
        { status: 500 }
      );
    }

    let supabase: any = null;
try {
  supabase = supabaseAdminClient();
} catch (e: any) {
  console.warn("Supabase admin not configured:", e?.message);
}


    // ===============================
// âœ… PERSONA ENGINE (Phase B)
// ===============================
let profile: PersonaProfile | null = null;

try {
  if (supabase && studentId) {
    const { data } = await supabase
      .from("student_profile")
      .select("preferred_language, preferred_speed, explain_style, weak_topic_ids, persona_summary")
      .eq("student_id", studentId)
      .maybeSingle();

    profile = (data as any) || null;
  } else if (supabase && studentMobile) {
    const { data } = await supabase
      .from("student_profile")
      .select("preferred_language, preferred_speed, explain_style, weak_topic_ids, persona_summary")
      .eq("mobile", studentMobile)
      .maybeSingle();

    profile = (data as any) || null;
  }
} catch (e) {
  console.error("persona profile load failed:", e);
}


const decision = decidePersona(profile, {
  question,
  topicId: topicDbId || null,
  chapterId: chapterDbId || null,
  subjectId: subjectDbId || null,
  lang: (lang as any) || undefined,
});

const personaInstruction = buildPersonaInstruction(decision);

// Use persona language for teacher output + TTS
const personaLang = decision.language;

const languageInstruction =
  personaLang === "hi"
    ? "Reply in simple Hindi that a child of this class in India can understand. Keep sentences short."
    : personaLang === "bn"
    ? "Reply in simple Bengali that a child of this class in India can understand. Use easy Bengali sentences."
    : "Reply in simple English that a child of this class can understand.";


    // ------------------------
    // âœ… 1) MEMORY SEARCH FIRST (if RPC exists + ids present)
    // NOTE: Your RPC signature must match your DB function. If your current call works, keep it.
    // If it fails, weâ€™ll adjust separately.
    // ------------------------
    try {
      if (false && !isRepeatRequest && supabase && question && subjectDbId && chapterDbId && topicDbId) {
        // If your match_teacher_memory expects query_embedding instead of query_text,
        // we must change this. Leaving as-is ONLY if it works in your DB.
        const { data, error } = await supabase.rpc("match_teacher_memory", {
          query_text: question,
          filter_subject_id: subjectDbId,
          filter_chapter_id: chapterDbId,
          filter_topic_id: topicDbId,
          match_count: 1,
        });

        if (!error && data && data.length > 0 && data[0]?.answer) {
          return NextResponse.json(
            { answer: data[0].answer, source: "memory" },
            { status: 200 }
          );
        }
      }
    } catch (e) {
      console.error("memory search failed:", e);
    }

    // ------------------------
    // 2) OTHERWISE CALL OPENAI
    // ------------------------
    const systemPrompt = `
You are a kind Indian school teacher.

PERSONA RULES (must follow):
${personaInstruction}

Subject: ${teacher.displayName}
Board: ${boardLabel}
Class: ${teacher.classId}
Chapter: ${chapter.title}

${languageInstruction}

Your job is to:
- Restate the child's doubt in one simple line.
- Explain step-by-step clearly.
- Give 1 to 2 small worked examples related only to the selected topic: ${selectedTopicName || selectedChapterName || chapter.title}.
- Use short, simple sentences.
- End with one follow-up question to check understanding.
`.trim();

// âœ… If confusion detected, mark topic as weak (best effort)
// âœ… If confusion detected, mark topic as weak (best effort)
try {
  if (supabase && decision.weakTopicAdd && (studentId || studentMobile)) {
  const { data: row } = studentId
    ? await supabase
        .from("student_profile")
        .select("weak_topic_ids")
        .eq("student_id", studentId)
        .maybeSingle()
    : await supabase
        .from("student_profile")
        .select("weak_topic_ids")
        .eq("mobile", studentMobile)
        .maybeSingle();

  const current: string[] = Array.isArray((row as any)?.weak_topic_ids)
    ? (row as any).weak_topic_ids
    : [];

  if (!current.includes(decision.weakTopicAdd)) {
    const next = [...current, decision.weakTopicAdd];

    if (studentId) {
      await supabase
        .from("student_profile")
        .update({ weak_topic_ids: next })
        .eq("student_id", studentId);
    } else {
      await supabase
        .from("student_profile")
        .update({ weak_topic_ids: next })
        .eq("mobile", studentMobile);
    }
  }
}

} catch (e) {
  console.error("weak topic update failed:", e);
}


    const userPrompt = `
Internal class: ${teacher.classId}
Board: ${boardLabel}
Chapter: ${chapter.title}

Student question: ${question}

Explain according to the syllabus of this class and board, focused on the given chapter.
`.trim();

    const model = pickModel(question);

    const rawResponse = await openai.responses.create({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let answer = "Sorry, I could not answer this question.";
    try {
      const response: any = rawResponse;
      if (response.output_text) {
        answer = response.output_text;
      } else if (response.output?.[0]?.content) {
        answer = response.output[0].content
          .map((c: any) => c.text || c.value || "")
          .join(" ");
      }
    } catch (e) {
      console.error("Answer parsing error:", e);
    }

    // ------------------------
    // âœ… PHASE B: Persona Engine (UPDATE profile)
    // ------------------------
    if (supabase && (studentId || studentMobile)) {
  try {
    const existingWeak: string[] = Array.isArray(profile?.weak_topic_ids)
      ? profile!.weak_topic_ids!
      : [];

    const toAdd = decision.weakTopicAdd ? [decision.weakTopicAdd] : [];
    const mergedWeak = Array.from(new Set([...existingWeak, ...toAdd])).slice(0, 50);

    const filter = studentId ? { student_id: studentId } : { mobile: studentMobile };

    await supabase
      .from("student_profile")
      .update({
        preferred_language: decision.language,
        preferred_speed: decision.speed,
        explain_style: decision.style,
        weak_topic_ids: mergedWeak,
        updated_at: new Date().toISOString(),
      })
      .match(filter);
  } catch (e) {
    console.error("student_profile update failed:", e);
  }
}



    // ------------------------
    // 3) SAVE TO MEMORY (Supabase teacher_memory)
    // ------------------------
    if (supabase) {
      try {
        const embedding = await embedQuestion(openai, question);

        const { error } = await supabase.from("teacher_memory").insert({
          student_mobile: studentMobile || null, // ok for now
          board: String(board),
          class_id: String(classId),

          // IMPORTANT:
          // If your teacher_memory.subject_id/chapter_id/topic_id are TEXT (DB ids),
          // use subjectDbId/chapterDbId/topicDbId.
          subject_id: String(subjectDbId || subjectId || "").trim() || null,
          chapter_id: String(chapterDbId || chapterId || "").trim() || null,
          topic_id: String(topicDbId || topicId || "").trim() || null,

          question,
          answer,
          lang: String(lang),
          embedding,
        });

        if (error) console.error("teacher_memory insert error:", error);
      } catch (e) {
        console.error("Memory save failed:", e);
      }
    }

    // ---- Optional TTS ----
    let audioBase64 = "";
    try {
      const safeText = answer.length > 1200 ? answer.slice(0, 1200) : answer;

const tts = await openai.audio.speech.create({
  model: "gpt-4o-mini-tts",
  voice: "alloy",
  input: safeText,
  response_format: "mp3",
});


      const arrayBuffer = await tts.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      audioBase64 = buffer.toString("base64");
    } catch (e) {
      console.error("TTS error:", e);
    }

    return NextResponse.json(
  {
    answer,
    modelUsed: model,
    cached: false,
    persona: {
      language: decision.language,
      speed: decision.speed,
      style: decision.style,
      notes: decision.notes,
    },
    audio: audioBase64 ? `data:audio/mp3;base64,${audioBase64}` : null,
  },
  { status: 200 }
);  
  } catch (err: any) {
    console.error("teacher-math error:", err);

    const msg = err?.error?.message || err?.message || "Unknown error";

    if (msg.toLowerCase().includes("insufficient_quota")) {
      return NextResponse.json(
        { error: "Teacher busy: AI quota/credit over. Recharge OpenAI billing." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: msg }, // keep the real error during dev
      { status: 500 }
    );
  }
}


