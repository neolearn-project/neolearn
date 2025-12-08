// app/api/ai-syllabus-subject/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

// Read envs as plain strings; we'll validate + create client inside POST.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const ADMIN_PASSWORD = process.env.NEOLEARN_ADMIN_PASSWORD || "";

type AiTopic = { number: number; name: string };
type AiChapter = { number: number; name: string; topics: AiTopic[] };
type AiSyllabus = {
  subject: {
    board: string;
    class: number;
    name: string;
    code?: string;
  };
  chapters: AiChapter[];
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      adminPassword,
      board: boardRaw,
      classLevel,
      subjectName,
      subjectCode,
      overwriteExisting,
    } = body;

    // ✅ USE THE SAME ENV VAR AS LEADS ADMIN ROUTES
    const ADMIN_PASSWORD = process.env.NEOLEARN_ADMIN_PASSWORD;

    if (!ADMIN_PASSWORD) {
      return NextResponse.json(
        { ok: false, error: "Admin password not configured on server." },
        { status: 500 }
      );
    }

    if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { ok: false, error: "Invalid admin password." },
        { status: 401 }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase server env vars are missing." },
        { status: 500 }
      );
    }

const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const board = boardRaw.toUpperCase();

    // --------------- 1) Ask OpenAI for JSON syllabus ---------------
    const systemPrompt = `
You are an experienced school syllabus designer for Indian boards.

Return ONLY valid JSON (no markdown, no backticks, no commentary).
The JSON schema must be exactly:

{
  "subject": {
    "board": "CBSE",
    "class": 6,
    "name": "Mathematics",
    "code": "maths6"
  },
  "chapters": [
    {
      "number": 1,
      "name": "Chapter title",
      "topics": [
        { "number": 1, "name": "Topic title" }
      ]
    }
  ]
}

Rules:
- 8–14 chapters for Class 6.
- 3–8 topics per chapter.
- Use realistic CBSE-style chapter & topic names.
- DO NOT include any extra fields.
- DO NOT include explanations, notes or examples.
- The value of "board" must be "${board}".
- The value of "class" must be ${classNumber}.
- The value of "name" must be "${subjectName}".
- The value of "code" should be "${subjectCode || ""}" if provided, otherwise a simple lowercase code like "maths6".
`.trim();

    const userPrompt = `
Design a clean syllabus for:

Board: ${board}
Class: ${classNumber}
Subject: ${subjectName}

Return ONLY JSON as per the schema. No backticks, no markdown.
`.trim();

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let raw = (response.output_text || "").trim();

    // Sometimes the model wraps in ```json ... ```
    if (raw.startsWith("```")) {
      const firstNewline = raw.indexOf("\n");
      raw = raw.slice(firstNewline + 1);
      if (raw.startsWith("json")) {
        const secondNewline = raw.indexOf("\n");
        raw = raw.slice(secondNewline + 1);
      }
      const fence = raw.lastIndexOf("```");
      if (fence !== -1) raw = raw.slice(0, fence);
      raw = raw.trim();
    }

    let syllabus: AiSyllabus;
    try {
      syllabus = JSON.parse(raw);
    } catch (e) {
      console.error("AI syllabus JSON parse error:", e, raw);
      return NextResponse.json(
        {
          ok: false,
          error:
            "AI did not return valid JSON. Check logs / raw field in response.",
          raw,
        },
        { status: 500 }
      );
    }

    const chapters = syllabus.chapters || [];
    const chapterCount = chapters.length;

    if (!chapterCount) {
      return NextResponse.json(
        { ok: false, error: "AI returned 0 chapters." },
        { status: 500 }
      );
    }

    // --------------- 2) Upsert into Supabase ---------------

    // 2a) Find or create subject row
    const subjName = subjectName;
    const subjCode =
      subjectCode || syllabus.subject.code || subjName.toLowerCase().slice(0, 6);

    const { data: existingSubject, error: selectErr } = await supabase
      .from("subjects")
      .select("id")
      .eq("board", board)
      .eq("class_number", classNumber)
      .eq("subject_name", subjName)
      .maybeSingle();

    if (selectErr) {
      console.error("Supabase select subject error:", selectErr);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch subject from Supabase." },
        { status: 500 }
      );
    }

    let subjectId: number;

    if (existingSubject?.id) {
      subjectId = existingSubject.id;
      // Optionally update subject_code if empty
      await supabase
        .from("subjects")
        .update({ subject_code: subjCode })
        .eq("id", subjectId);
    } else {
      const { data: newSubj, error: insertErr } = await supabase
        .from("subjects")
        .insert({
          board,
          class_number: classNumber,
          subject_code: subjCode,
          subject_name: subjName,
        })
        .select("id")
        .single();

      if (insertErr || !newSubj) {
        console.error("Supabase insert subject error:", insertErr);
        return NextResponse.json(
          { ok: false, error: "Failed to insert subject into Supabase." },
          { status: 500 }
        );
      }
      subjectId = newSubj.id;
    }

    // 2b) Overwrite existing chapters/topics if checkbox is on
    if (overwriteExisting) {
      const { data: oldChapters, error: chErr } = await supabase
        .from("chapters")
        .select("id")
        .eq("subject_id", subjectId);

      if (chErr) {
        console.error("Supabase fetch old chapters error:", chErr);
      } else if (oldChapters && oldChapters.length > 0) {
        const chapterIds = oldChapters.map((c) => c.id);

        const { error: delTopicsErr } = await supabase
          .from("topics")
          .delete()
          .in("chapter_id", chapterIds);

        if (delTopicsErr) {
          console.error("Supabase delete topics error:", delTopicsErr);
        }

        const { error: delChErr } = await supabase
          .from("chapters")
          .delete()
          .eq("subject_id", subjectId);

        if (delChErr) {
          console.error("Supabase delete chapters error:", delChErr);
        }
      }
    }

    // 2c) Insert new chapters & topics
    let chaptersInserted = 0;

    for (const ch of chapters) {
      const { data: chRow, error: chInsertErr } = await supabase
        .from("chapters")
        .insert({
          subject_id: subjectId,
          chapter_number: ch.number,
          chapter_name: ch.name,
        })
        .select("id")
        .single();

      if (chInsertErr || !chRow) {
        console.error("Supabase insert chapter error:", chInsertErr, ch);
        continue;
      }

      chaptersInserted++;

      const topics = ch.topics || [];
      if (topics.length === 0) continue;

      const topicRows = topics.map((t) => ({
        chapter_id: chRow.id,
        topic_number: t.number,
        topic_name: t.name,
        content: { level: "basic" }, // simple placeholder
        is_active: true,
      }));

      const { error: tErr } = await supabase.from("topics").insert(topicRows);
      if (tErr) {
        console.error("Supabase insert topics error:", tErr);
      }
    }

    return NextResponse.json({
      ok: true,
      subjectId,
      chaptersInserted,
      summary: {
        chapterCount,
      },
      syllabus, // optional: full JSON for debugging
    });
  } catch (err) {
    console.error("ai-syllabus-subject route error:", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
