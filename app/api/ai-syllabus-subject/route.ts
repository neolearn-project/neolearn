// app/api/ai-syllabus-subject/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

// Supabase **service** client (server-side only)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

type Board = "cbse" | "icse" | "tbse";

interface AiTopic {
  number: number;
  name: string;
  level?: string;
}

interface AiChapter {
  number: number;
  name: string;
  topics: AiTopic[];
}

interface AiSyllabus {
  chapters: AiChapter[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 🔐 Simple admin password check (same password as other admin pages)
    const adminEnv = process.env.NEOLEARN_ADMIN_PASSWORD;
    const adminFromRequest = (body.adminPassword as string) || "";

    if (adminEnv && adminFromRequest !== adminEnv) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized: wrong admin password." },
        { status: 401 }
      );
    }


    const board = ((body.board as string) || "cbse").toLowerCase() as Board;
    const classNumber = Number(body.classNumber || 6);
    const subjectName = (body.subjectName as string) || "Mathematics";

    const subjectCode =
      (body.subjectCode as string) ||
      subjectName.toLowerCase().replace(/\s+/g, "");
    const overwrite = Boolean(body.overwrite);

    if (!["cbse", "icse", "tbse"].includes(board)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported board. Use cbse / icse / tbse." },
        { status: 400 }
      );
    }

    // 1) Ask OpenAI to design a syllabus as JSON
    const systemPrompt = `
You are an expert curriculum designer for Indian school boards.

Your job is to design a clean syllabus for **Class ${classNumber} ${subjectName}** for board ${board.toUpperCase()}.

Return ONLY valid JSON. No comments, no Markdown, no extra text.

The JSON format must be:

{
  "chapters": [
    {
      "number": 1,
      "name": "Chapter title",
      "topics": [
        { "number": 1, "name": "Topic title", "level": "basic" }
      ]
    }
  ]
}

Rules:
- 8–12 chapters for a full-year subject, unless that subject is naturally smaller.
- 3–6 topics per chapter.
- "level" must be one of: "basic", "intermediate", "advanced".
- Keep chapter and topic names short and close to NCERT / CBSE style.
`;

    const userPrompt = `Design the Class ${classNumber} ${subjectName} syllabus for ${board.toUpperCase()} board using the exact JSON format described.`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = (response.output_text || "").trim();
    if (!raw) {
      throw new Error("OpenAI returned empty syllabus.");
    }

    let syllabus: AiSyllabus;
    try {
      syllabus = JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse JSON from OpenAI:", raw);
      throw new Error("Could not parse syllabus JSON from OpenAI.");
    }

    const chapters = syllabus.chapters || [];
    if (!Array.isArray(chapters) || chapters.length === 0) {
      throw new Error("Syllabus JSON has no chapters.");
    }

    // 2) Find or create subject row
    const { data: subjectRows, error: subjectFetchError } = await supabase
      .from("subjects")
      .select("*")
      .eq("board", board)
      .eq("class_number", classNumber)
      .eq("subject_name", subjectName)
      .limit(1);

    if (subjectFetchError) {
      console.error("Supabase subject fetch error:", subjectFetchError);
      throw new Error("Failed to read subject from database.");
    }

    let subjectId: number;

    if (subjectRows && subjectRows.length > 0) {
      subjectId = subjectRows[0].id;

      if (overwrite) {
        // Remove old chapters (topics should cascade if FK is ON DELETE CASCADE)
        const { error: delError } = await supabase
          .from("chapters")
          .delete()
          .eq("subject_id", subjectId);

        if (delError) {
          console.error("Supabase delete chapters error:", delError);
          throw new Error("Failed to clear old syllabus.");
        }
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("subjects")
        .insert({
          board,
          class_number: classNumber,
          subject_code: subjectCode,
          subject_name: subjectName,
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        console.error("Supabase insert subject error:", insertError);
        throw new Error("Failed to create subject row.");
      }
      subjectId = inserted.id;
    }

    // 3) Insert chapters + topics
    let chaptersInserted = 0;
    for (const ch of chapters) {
      const chapterNumber = Number(ch.number);
      const chapterName = (ch.name || "").trim();
      if (!chapterNumber || !chapterName) continue;

      const { data: chapterRow, error: chapterError } = await supabase
        .from("chapters")
        .insert({
          subject_id: subjectId,
          chapter_number: chapterNumber,
          chapter_name: chapterName,
        })
        .select("id, chapter_number, chapter_name")
        .single();

      if (chapterError || !chapterRow) {
        console.error("Supabase insert chapter error:", chapterError);
        continue;
      }

      chaptersInserted++;

      const topicsArray = Array.isArray(ch.topics) ? ch.topics : [];
      const topicsPayload = topicsArray
        .map((t: AiTopic) => {
          const topicName = (t.name || "").trim();
          if (!topicName) return null;
          return {
            chapter_id: chapterRow.id,
            topic_number: Number(t.number) || 1,
            topic_name: topicName,
            content: { level: t.level || "basic" },
            is_active: true,
          };
        })
        .filter(Boolean) as any[];

      if (topicsPayload.length > 0) {
        const { error: topicsError } = await supabase
          .from("topics")
          .insert(topicsPayload);

        if (topicsError) {
          console.error("Supabase insert topics error:", topicsError);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      subjectId,
      chaptersInserted,
    });
  } catch (err: any) {
    console.error("ai-syllabus-subject error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to generate AI syllabus." },
      { status: 500 }
    );
  }
}
