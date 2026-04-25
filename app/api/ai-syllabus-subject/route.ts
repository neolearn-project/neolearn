import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getTextbookMaster } from "@/app/lib/textbookMasters/index";

const openai = new OpenAI({
  apiKey: process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function normalizeText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeCatalogKey(args: {
  subjectId: number | null;
  chapterId: number | null;
  topicId: number | null;
  contentType: string;
}) {
  return [
    args.contentType,
    args.subjectId ?? 0,
    args.chapterId ?? 0,
    args.topicId ?? 0,
  ].join(":");
}

function guessChapterType(subjectName: string, chapterName: string): string {
  const subject = normalizeText(subjectName);
  const chapter = normalizeText(chapterName);

  if (subject.includes("english")) {
    if (
      chapter.includes("noun") ||
      chapter.includes("pronoun") ||
      chapter.includes("verb") ||
      chapter.includes("adjective") ||
      chapter.includes("adverb") ||
      chapter.includes("tense") ||
      chapter.includes("article") ||
      chapter.includes("preposition") ||
      chapter.includes("conjunction") ||
      chapter.includes("sentence") ||
      chapter.includes("voice") ||
      chapter.includes("speech") ||
      chapter.includes("modals") ||
      chapter.includes("determiners") ||
      chapter.includes("grammar")
    ) {
      return "grammar";
    }

    if (chapter.includes("writing")) return "writing";
    if (chapter.includes("poem")) return "poem";

    return "literature";
  }

  if (subject.includes("math")) return "math";
  if (subject.includes("science")) return "science";
  if (
    subject.includes("history") ||
    subject.includes("geography") ||
    subject.includes("civics") ||
    subject.includes("social")
  ) {
    return "sst";
  }

  return "general";
}

async function upsertCatalogRow(
  supabase: any,
  row: Record<string, any>
) {
  const payload = {
    ...row,
    catalog_key: makeCatalogKey({
      subjectId: row.subject_id ?? null,
      chapterId: row.chapter_id ?? null,
      topicId: row.topic_id ?? null,
      contentType: row.content_type,
    }),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("content_catalog")
    .upsert(payload, {
      onConflict: "catalog_key",
      ignoreDuplicates: false,
    });

  if (error) {
    console.error("content_catalog upsert error:", error, payload);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      adminPassword,
      board: boardRaw,
      classLevel,
      classNumber: classNumberRaw,
      subjectName,
      subjectCode,
      bookName,
      textbookSeries,
      overwriteExisting,
      overwrite,
    } = body;

    const ADMIN_PASSWORD =
      process.env.NEOLEARN_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

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

    const rawBoard = (boardRaw as string | undefined) || "CBSE";
    const boardKey = rawBoard.trim().toLowerCase();
    const boardLabel = boardKey.toUpperCase();

    const rawClassValue =
      classNumberRaw !== undefined && classNumberRaw !== null
        ? classNumberRaw
        : classLevel;

    const classNumber =
      typeof rawClassValue === "number"
        ? rawClassValue
        : parseInt(String(rawClassValue || "6"), 10) || 6;

    const subjName = String(subjectName || "").trim();
    const subjCodeInput = (subjectCode as string | undefined)?.trim();
    const resolvedBookName = String(bookName || "").trim();
    const resolvedTextbookSeries = String(textbookSeries || "").trim();
    const shouldOverwrite = Boolean(overwriteExisting ?? overwrite);

    if (!subjName) {
      return NextResponse.json(
        { ok: false, error: "Subject name is required." },
        { status: 400 }
      );
    }

    let syllabus: any = null;
    let sourceMode: "master" | "ai" = "ai";

    // ---------------------------------------------------
    // 1) MASTER DATA FIRST
    // ---------------------------------------------------
    const master = getTextbookMaster({
      board: boardKey,
      classNumber,
      subjectName: subjName,
      bookName: resolvedBookName,
    });

    if (master) {
      syllabus = {
        subject: {
          board: boardLabel,
          class: classNumber,
          name: master.subjectName,
          code:
            subjCodeInput ||
            master.subjectCode ||
            subjName.toLowerCase().replace(/\s+/g, ""),
          bookName: master.bookName || resolvedBookName || null,
          textbookSeries:
            master.textbookSeries ||
            resolvedTextbookSeries ||
            master.bookName ||
            resolvedBookName ||
            null,
        },
        chapters: master.chapters.map((ch) => ({
          number: ch.number,
          name: ch.name,
          chapterType: ch.chapterType || guessChapterType(master.subjectName, ch.name),
          topics: (ch.topics || []).map((t) => ({
            number: t.number,
            name: t.name,
          })),
        })),
      };

      sourceMode = "master";
    }

    // ---------------------------------------------------
    // 2) AI FALLBACK ONLY IF NO MASTER
    // ---------------------------------------------------
    if (!syllabus) {
      const isEnglishSubject = /english/i.test(subjName);

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
- Return ONLY chapters/topics that genuinely belong to the requested class and subject.
- Do NOT mix chapters from other classes.
- Do NOT invent textbook names.
- 8–14 chapters unless the requested textbook genuinely has fewer.
- 3–8 topics per chapter.
- NO explanations, no extra fields.
- board must be "${boardLabel}".
- class must be ${classNumber}.
- name must be "${subjName}".
- code must be "${subjCodeInput || ""}" if provided, else something like "maths6".
${
  isEnglishSubject && resolvedBookName
    ? `
English-specific strict rule:
- Generate the syllabus ONLY from this textbook/book source:
  Book name: "${resolvedBookName}"
  Textbook series: "${resolvedTextbookSeries || resolvedBookName}"
- Do NOT include chapters from any other English book, class, or reader.
`
    : `
If the subject is English and no textbook is provided:
- Prefer the standard textbook most commonly used for this board/class.
- Do NOT merge prose, poetry, grammar, writing, and supplementary readers incorrectly.
`
}
`.trim();

      const userPrompt = `
Design a clean syllabus for:

Board: ${boardLabel}
Class: ${classNumber}
Subject: ${subjName}
${resolvedBookName ? `Book name: ${resolvedBookName}` : ""}
${resolvedTextbookSeries ? `Textbook series: ${resolvedTextbookSeries}` : ""}

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

      try {
        syllabus = JSON.parse(raw);
      } catch (e) {
        console.error("JSON parse error:", e, raw);
        return NextResponse.json(
          { ok: false, error: "AI returned invalid JSON.", raw },
          { status: 500 }
        );
      }
    }

    const chapters = syllabus?.chapters || [];
    if (!chapters.length) {
      return NextResponse.json(
        { ok: false, error: "Syllabus returned 0 chapters." },
        { status: 500 }
      );
    }

    // ---------------------------------------------------
    // 3) UPSERT SUBJECT
    // ---------------------------------------------------
    const { data: existingSubject } = await supabase
      .from("subjects")
      .select("id")
      .eq("board", boardKey)
      .eq("class_number", classNumber)
      .eq("subject_name", subjName)
      .maybeSingle();

    let subjectId: number;
    const finalCode =
      subjCodeInput ||
      syllabus?.subject?.code ||
      subjName.toLowerCase().replace(/\s+/g, "").slice(0, 12);

    if (existingSubject?.id) {
      subjectId = existingSubject.id;

      await supabase
        .from("subjects")
        .update({ subject_code: finalCode })
        .eq("id", subjectId);
    } else {
      const { data: newSubj, error: insertErr } = await supabase
        .from("subjects")
        .insert({
          board: boardKey,
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

    await upsertCatalogRow(supabase as any, {
      subject_id: subjectId,
      chapter_id: null,
      topic_id: null,
      board: boardKey,
      class_number: classNumber,
      subject_code: finalCode,
      subject_name: subjName,
      book_name:
        syllabus?.subject?.bookName || resolvedBookName || master?.bookName || null,
      chapter_number: null,
      chapter_name: null,
      topic_number: null,
      topic_name: null,
      content_type: "subject",
      stream_type: "regular",
      chapter_type: guessChapterType(subjName, ""),
      source_ref: null,
      textbook_series:
        syllabus?.subject?.textbookSeries ||
        resolvedTextbookSeries ||
        master?.textbookSeries ||
        resolvedBookName ||
        master?.bookName ||
        null,
      language: "en",
      subject_aliases: [],
      book_aliases: [],
      chapter_aliases: [],
      topic_aliases: [],
      normalized_subject: normalizeText(subjName),
      normalized_book: normalizeText(
        syllabus?.subject?.bookName || resolvedBookName || master?.bookName || ""
      ) || null,
      normalized_chapter: null,
      normalized_topic: null,
      is_active: true,
    });

    // ---------------------------------------------------
    // 4) DELETE OLD DATA IF OVERWRITE
    // ---------------------------------------------------
    if (shouldOverwrite) {
      const { data: old } = await supabase
        .from("chapters")
        .select("id")
        .eq("subject_id", subjectId);

      if (old?.length) {
        const ids = old.map((c: any) => c.id);
        await supabase.from("topics").delete().in("chapter_id", ids);
        await supabase.from("chapters").delete().eq("subject_id", subjectId);
        await supabase
          .from("content_catalog")
          .delete()
          .eq("subject_id", subjectId)
          .neq("content_type", "subject");
      }
    }

    // ---------------------------------------------------
    // 5) INSERT CHAPTERS + TOPICS + CATALOG
    // ---------------------------------------------------
    let chaptersInserted = 0;
    let topicsInserted = 0;

    for (const ch of chapters) {
      const chapterName = String(ch.name || "").trim();
      const chapterType =
        String(ch.chapterType || "").trim() || guessChapterType(subjName, chapterName);

      const { data: chRow, error: chErr } = await supabase
        .from("chapters")
        .insert({
          subject_id: subjectId,
          chapter_number: ch.number,
          chapter_name: chapterName,
        })
        .select("id")
        .single();

      if (!chRow || chErr) {
        console.error("chapter insert error:", chErr, ch);
        continue;
      }

      chaptersInserted++;

      await upsertCatalogRow(supabase as any, {
        subject_id: subjectId,
        chapter_id: chRow.id,
        topic_id: null,
        board: boardKey,
        class_number: classNumber,
        subject_code: finalCode,
        subject_name: subjName,
        book_name:
          syllabus?.subject?.bookName || resolvedBookName || master?.bookName || null,
        chapter_number: ch.number ?? null,
        chapter_name: chapterName,
        topic_number: null,
        topic_name: null,
        content_type: "chapter",
        stream_type: "regular",
        chapter_type: chapterType,
        source_ref: null,
        textbook_series:
          syllabus?.subject?.textbookSeries ||
          resolvedTextbookSeries ||
          master?.textbookSeries ||
          resolvedBookName ||
          master?.bookName ||
          null,
        language: "en",
        subject_aliases: [],
        book_aliases: [],
        chapter_aliases: [],
        topic_aliases: [],
        normalized_subject: normalizeText(subjName),
        normalized_book: normalizeText(
          syllabus?.subject?.bookName || resolvedBookName || master?.bookName || ""
        ) || null,
        normalized_chapter: normalizeText(chapterName),
        normalized_topic: null,
        is_active: true,
      });

      const topicRows = (ch.topics || []).map((t: { number: number; name: string }) => ({
        chapter_id: chRow.id,
        topic_number: t.number,
        topic_name: String(t.name || "").trim(),
        content: { level: "basic" },
        is_active: true,
      }));

      const { data: insertedTopics, error: topicInsertErr } = await supabase
        .from("topics")
        .insert(topicRows)
        .select("id, topic_number, topic_name, is_active");

      if (topicInsertErr) {
        console.error("topic insert error:", topicInsertErr, chapterName);
        continue;
      }

      if (insertedTopics?.length) {
        topicsInserted += insertedTopics.length;

        for (const t of insertedTopics) {
          await upsertCatalogRow(supabase as any, {
            subject_id: subjectId,
            chapter_id: chRow.id,
            topic_id: t.id,
            board: boardKey,
            class_number: classNumber,
            subject_code: finalCode,
            subject_name: subjName,
            book_name:
              syllabus?.subject?.bookName || resolvedBookName || master?.bookName || null,
            chapter_number: ch.number ?? null,
            chapter_name: chapterName,
            topic_number: t.topic_number ?? null,
            topic_name: String(t.topic_name || "").trim(),
            content_type: "topic",
            stream_type: "regular",
            chapter_type: chapterType,
            source_ref: null,
            textbook_series:
              syllabus?.subject?.textbookSeries ||
              resolvedTextbookSeries ||
              master?.textbookSeries ||
              resolvedBookName ||
              master?.bookName ||
              null,
            language: "en",
            subject_aliases: [],
            book_aliases: [],
            chapter_aliases: [],
            topic_aliases: [],
            normalized_subject: normalizeText(subjName),
            normalized_book: normalizeText(
              syllabus?.subject?.bookName || resolvedBookName || master?.bookName || ""
            ) || null,
            normalized_chapter: normalizeText(chapterName),
            normalized_topic: normalizeText(String(t.topic_name || "")),
            is_active: Boolean(t.is_active),
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      sourceMode,
      subjectId,
      chaptersInserted,
      topicsInserted,
      subject: syllabus?.subject || null,
      summary: { chapterCount: chapters.length },
    });
  } catch (err: any) {
    console.error("ai-syllabus error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}


