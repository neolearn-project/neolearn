// app/api/ai-syllabus-subject/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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

    // -----------------------------
    // ✅ ADMIN PASSWORD CHECK
    // -----------------------------
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

    // -----------------------------
    // ✅ SUPABASE VALIDATION
    // -----------------------------
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase server env vars are missing." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // -----------------------------
    // ✅ FIXED BOARD + CLASS LOGIC
    // -----------------------------
    const rawBoard = (boardRaw as string | undefined) || "CBSE";

    const boardKey = rawBoard.trim().toLowerCase();  // for database: "cbse"
    const boardLabel = boardKey.toUpperCase();       // for AI output: "CBSE"

    const classNumber =
      typeof classLevel === "number"
        ? classLevel
        : parseInt(String(classLevel || "6"), 10) || 6;

    const subjName = (subjectName as string).trim();
    const subjCodeInput = (subjectCode as string | undefined)?.trim();

    // -----------------------------
    // 1) AI – Generate JSON Syllabus
    // -----------------------------
    const systemPrompt = `
You are an experienced school syllabus designer for Indian boards.

Return ONLY valid JSON (no markdown, no backticks, no commentary).

The JSON must match:

{
  "subject": {
    "board": "${boardLabel}",
    "class": ${classNumber},
    "name": "${subjName}",
    "code": "maths6"
  },
  "chapters": [
    {
      "number": 1,
      "name": "Chapter Title",
      "topics": [
        { "number": 1, "name": "Topic Title" }
      ]
    }
  ]
}

Rules:
- 8–14 chapters.
- 3–8 topics per chapter.
- NO explanations, no extra fields.
- board must be "${boardLabel}".
- class must be ${classNumber}.
- name must be "${subjName}".
- code must be "${subjCodeInput || ""}" if provided, else something like "maths6".
`.trim();

    const userPrompt = `
Design a clean syllabus for:

Board: ${boardLabel}
Class: ${classNumber}
Subject: ${subjName}

Return ONLY JSON.
`.trim();

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let raw = (response.output_text || "").trim();

    // Remove ```json wrappers if present
    if (raw.startsWith("```")) {
      const first = raw.indexOf("\n");
      raw = raw.slice(first + 1);

      if (raw.startsWith("json")) {
        const second = raw.indexOf("\n");
        raw = raw.slice(second + 1);
      }

      const fence = raw.lastIndexOf("```");
      if (fence !== -1) raw = raw.slice(0, fence);
      raw = raw.trim();
    }

    let syllabus;
    try {
      syllabus = JSON.parse(raw);
    } catch (e) {
      console.error("JSON parse error:", e, raw);
      return NextResponse.json(
        { ok: false, error: "AI returned invalid JSON.", raw },
        { status: 500 }
      );
    }

    const chapters = syllabus.chapters || [];
    if (!chapters.length) {
      return NextResponse.json(
        { ok: false, error: "AI returned 0 chapters." },
        { status: 500 }
      );
    }

    // -----------------------------
    // 2) UPSERT SUBJECT
    // -----------------------------
    const { data: existingSubject } = await supabase
      .from("subjects")
      .select("id")
      .eq("board", boardKey)
      .eq("class_number", classNumber)
      .eq("subject_name", subjName)
      .maybeSingle();

    let subjectId: number;
    const finalCode =
      subjCodeInput || syllabus.subject.code || subjName.toLowerCase().slice(0, 6);

    if (existingSubject?.id) {
      subjectId = existingSubject.id;

      // Update code if needed
      await supabase
        .from("subjects")
        .update({ subject_code: finalCode })
        .eq("id", subjectId);
    } else {
      const { data: newSubj, error: insertErr } = await supabase
        .from("subjects")
        .insert({
          board: boardKey,   // important fix
          class_number: classNumber,
          subject_code: finalCode,
          subject_name: subjName,
        })
        .select("id")
        .single();

      if (insertErr || !newSubj) {
        console.error("Supabase insert error:", insertErr);
        return NextResponse.json(
          { ok: false, error: "Failed to insert subject into Supabase." },
          { status: 500 }
        );
      }

      subjectId = newSubj.id;
    }

    // -----------------------------
    // 3) DELETE OLD CHAPTERS/TOPICS
    // -----------------------------
    if (overwriteExisting) {
      const { data: old } = await supabase
        .from("chapters")
        .select("id")
        .eq("subject_id", subjectId);

      if (old?.length) {
        const ids = old.map((c) => c.id);
        await supabase.from("topics").delete().in("chapter_id", ids);
        await supabase.from("chapters").delete().eq("subject_id", subjectId);
      }
    }

    // -----------------------------
    // 4) INSERT NEW CHAPTERS + TOPICS
    // -----------------------------
    let chaptersInserted = 0;

    for (const ch of chapters) {
      const { data: chRow, error: chErr } = await supabase
        .from("chapters")
        .insert({
          subject_id: subjectId,
          chapter_number: ch.number,
          chapter_name: ch.name,
        })
        .select("id")
        .single();

      if (!chRow || chErr) continue;

      chaptersInserted++;

     const topicRows = (ch.topics || []).map(
  (t: { number: number; name: string }) => ({
    chapter_id: chRow.id,
    topic_number: t.number,
    topic_name: t.name,
    content: { level: "basic" },
    is_active: true,
  })
);

      await supabase.from("topics").insert(topicRows);
    }

    return NextResponse.json({
      ok: true,
      subjectId,
      chaptersInserted,
      summary: { chapterCount: chapters.length },
    });
  } catch (err) {
    console.error("ai-syllabus error:", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
