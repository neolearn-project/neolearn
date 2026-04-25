import { NextResponse } from "next/server";
import { headers } from "next/headers";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";
import { matchCatalogRows, normalizeText, type CatalogRow } from "@/app/lib/catalogMatch";

export const dynamic = "force-dynamic";

type NoteType = "full_exam_notes" | "quick_revision" | "important_qna" | "mcq_only";

const NOTE_TYPES: NoteType[] = [
  "full_exam_notes",
  "quick_revision",
  "important_qna",
  "mcq_only",
];

const CACHE_VERSION = 2;

function sanitizeGeneratedText(input: string): string {
  return String(input || "")
    .replace(/â€“/g, "-")
    .replace(/â€”/g, "-")
    .replace(/â€"/g, "-")
    .replace(/â€˜/g, "'")
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€¢/g, "-")
    .replace(/â†’/g, "->")
    .replace(/â†/g, "<-")
    .replace(/â‰¥/g, ">=")
    .replace(/â‰¤/g, "<=")
    .replace(/â‰ "/g, "!=")
    .replace(/!’/g, "->")
    .replace(/!'/g, "->")
    .replace(/â(?=\s)/g, "-")
    .replace(/â(?=\s*[A-Za-z])/g, "-")
    .replace(/Â/g, "")
    .replace(/Ã—/g, "×")
    .replace(/Ã·/g, "÷")
    .replace(/À/g, "π")
    .replace(/"\u0012/g, "-")
    .replace(/\u0012/g, "-")
    .replace(/\u0013/g, "-")
    .replace(/\u0014/g, "-")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function isNoteType(value: unknown): value is NoteType {
  return typeof value === "string" && NOTE_TYPES.includes(value as NoteType);
}

function makeMcq(topicName: string, count = 10): string[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return `**${n}.** ${topicName} practice MCQ ${n}
- A) Option 1
- B) Option 2
- C) Option 3
- D) Option 4
- **Answer:** ${["A", "B", "C", "D"][i % 4]}`;
  });
}

function makeQa(prefix: string, topicName: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) =>
      `**Q${i + 1}.** ${prefix} question on ${topicName}?
**A:** Model answer point ${i + 1} for ${topicName}.`
  );
}

function buildInternalMarkdown(args: {
  board: string;
  classId: string;
  subjectName: string;
  chapterName: string;
  topicName: string;
  noteType: NoteType;
  chapterType?: string | null;
}) {
  const { board, classId, subjectName, chapterName, topicName, noteType, chapterType } = args;

  const mcq = makeMcq(topicName, noteType === "mcq_only" ? 15 : 10);
  const qa2 = makeQa("2-mark", topicName, 6);
  const qa5 = makeQa("5-mark", topicName, 4);
  const caseBased = makeQa("Case-based", topicName, 2);

  const subjectLower = subjectName.toLowerCase();
  const importantHeading =
    chapterType === "grammar"
      ? "## Important rules / grammar points"
      : subjectLower.includes("english") || chapterType === "literature" || chapterType === "poem"
      ? "## Important points / literary devices"
      : "## Important points/formulas";

  const markdown =
    `# ${subjectName} Notes (${chapterName})

Board: ${board.toUpperCase()} | Class: ${classId} | Type: ${noteType}

## Overview
- This note covers **${topicName}** under **${chapterName}** for class ${classId}.

## Key definitions
- Definition 1 of ${topicName}.
- Definition 2 of ${topicName}.
- Definition 3 of ${topicName}.

${importantHeading}
- Important point 1 for ${topicName}.
- Important point 2 for ${topicName}.
- Important point 3 for ${topicName}.

## MCQ
${mcq.join("\n\n")}

## 2-mark Q&A
${qa2.join("\n\n")}

## 5-mark Q&A
${qa5.join("\n\n")}

## Case-based
${caseBased.join("\n\n")}

## Quick revision
- Revise all key ideas for ${topicName}.
- Solve at least 10 MCQs from this sheet.
- Practice 2-mark then 5-mark in that order.
- Focus on mistakes and application.`;

  return { markdown, qualityScore: 0.45 };
}

async function buildOpenAiMarkdown(args: {
  apiKey: string;
  board: string;
  classId: string;
  courseType: string;
  subjectName: string;
  chapterName: string;
  topicName: string;
  noteType: NoteType;
  chapterType?: string | null;
  bookName?: string | null;
}) {
  const client = new OpenAI({ apiKey: args.apiKey });

  const noteTypeLabel =
    args.noteType === "full_exam_notes"
      ? "full exam notes"
      : args.noteType === "quick_revision"
      ? "quick revision notes"
      : args.noteType === "important_qna"
      ? "important questions and answers"
      : "MCQ-only notes";

  const subjectLower = args.subjectName.toLowerCase();
  const chapterLower = args.chapterName.toLowerCase();
  const topicLower = args.topicName.toLowerCase();

  const isEnglish = subjectLower.includes("english");
  const isGrammar =
    args.chapterType === "grammar" ||
    (isEnglish &&
      (
        topicLower.includes("noun") ||
        topicLower.includes("pronoun") ||
        topicLower.includes("verb") ||
        topicLower.includes("adjective") ||
        topicLower.includes("adverb") ||
        topicLower.includes("tense") ||
        topicLower.includes("article") ||
        topicLower.includes("preposition") ||
        topicLower.includes("conjunction") ||
        topicLower.includes("sentence") ||
        topicLower.includes("voice") ||
        topicLower.includes("speech") ||
        topicLower.includes("modals") ||
        topicLower.includes("determiners")
      ));

  const isLiterature =
    args.chapterType === "literature" ||
    args.chapterType === "poem" ||
    (isEnglish && !isGrammar &&
      (
        chapterLower.includes("poem") ||
        chapterLower.includes("story") ||
        chapterLower.includes("chapter") ||
        chapterLower.includes("prose") ||
        chapterLower.includes("lesson") ||
        topicLower.includes("poem") ||
        topicLower.includes("story") ||
        topicLower.includes("character") ||
        topicLower.includes("theme") ||
        topicLower.includes("summary")
      ));

  const importantHeading = isEnglish
    ? isGrammar
      ? "## Important rules / grammar points"
      : isLiterature
      ? "## Important points / literary devices"
      : "## Important rules / grammar points"
    : "## Important points/formulas";

  const sourceBookLine = args.bookName ? `Book/Textbook: ${args.bookName}` : "";

  const prompt = `Create NeoLearn-standard ${noteTypeLabel} in Markdown for an Indian school student.

Board: ${args.board}
Class: ${args.classId}
Course: ${args.courseType}
Subject: ${args.subjectName}
${sourceBookLine}
Chapter: ${args.chapterName}
Topic: ${args.topicName}
Chapter type: ${args.chapterType || "general"}

Primary goal:
- Make the notes VERY SIMPLE to understand.
- Make the notes EASY TO MEMORIZE.
- Keep the format STANDARD across NeoLearn.
- Make them useful for school exams.

Writing rules:
- Use short sentences.
- Use very simple student-friendly English.
- Keep explanations direct and clear.
- Avoid long paragraphs.
- Use bullets wherever possible.
- Do NOT use placeholders like "Definition 1", "Option 1", "Model answer point".
- Output ONLY Markdown.
- Make it neat for PDF/print.
- Keep the difficulty suitable for Class ${args.classId}.
- Do not make Class ${args.classId} content unnecessarily advanced.

NeoLearn standard structure:
## Overview
- Write 3 to 5 very short lines only.

## Key definitions
- Give simple meanings in easy words.

${importantHeading}
- Include only the most important rules / ideas / formulas / literary devices.
- Keep this section short and memorable.

## MCQ
- At least 10 good exam-style MCQs.
- Keep options simple and clear.
- Give answer after each MCQ.

## 2-mark Q&A
- At least 6 very short exam answers.
- Keep each answer crisp and easy to memorize.

## 5-mark Q&A
- At least 4 structured answers.
- Keep them point-wise and school-exam friendly.

## Case-based
- At least 2 practical school-style cases.
- Keep answers direct and easy.

## Quick revision
- Final memory bullets only.
- This should feel like last-minute revision before exam.

Subject-specific rules:
- For English grammar: focus on rules, examples, common mistakes, usage.
- For English literature/poem: focus on actual chapter content first — summary, characters, main events, theme, tone, message, literary devices, and important textual details.
- For English literature/poem: do NOT make the note only about moral values unless the chapter itself clearly teaches that.
- For English literature/poem: questions and answers must come from the real chapter storyline/poem meaning, not generic value education.
- For Science: focus on definition, function, examples, uses, key differences, diagrams if needed.
- For Math: focus on concept, formula, steps, properties, solved-style thinking, but keep it class-appropriate.
- For Social Science: focus on facts, causes, effects, dates/names only when truly needed.

Special literature rules:
- If the chapter is a story or prose lesson, include short summary, key characters, key events, theme, and tone.
- If the chapter is a poem, include meaning, theme, tone, poetic devices, symbols, rhyme/meter only if relevant, and important interpretation points.
- Literature MCQs and Q&A must test chapter understanding, not just general moral words.
- Keep literature answers chapter-accurate and text-based.
- Avoid generic statements unless directly supported by the chapter.

Memory-friendly rules:
- Prefer 'must remember' style points.
- Avoid unnecessary theory.
- Keep revision fast.
- Make the student feel: "I can learn this quickly."

Minimum requirements:
- MCQ: at least 10
- 2-mark Q&A: at least 6
- 5-mark Q&A: at least 4
- Case-based: at least 2

Final quality rule:
- The note must feel standard, simple, neat, easy to memorize, and accurate to the actual chapter.`;

  const response = await client.responses.create({
    model: "gpt-5-mini",
    input: [{ role: "user", content: prompt }],
  });

  const text = (response as any)?.output_text?.trim();
  if (text) return text;

  const blocks = (response as any)?.output?.[0]?.content;
  if (Array.isArray(blocks)) {
    return blocks.map((b: any) => b?.text || b?.value || "").join("\n").trim();
  }

  return "";
}

async function resolveCatalogContext(args: {
  board: string;
  classNumber: number;
  subjectId?: string;
  chapterId?: string;
  topicId?: string | null;
  subjectNameHint?: string;
  chapterNameHint?: string;
  topicNameHint?: string;
}) {
  if (!supabaseUrl || !supabaseServiceKey) return null;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { board, classNumber, subjectId, chapterId, topicId, subjectNameHint, chapterNameHint, topicNameHint } = args;

  // 1) Try exact ID-based resolution first
  let exactRows: CatalogRow[] = [];

  if (topicId && /^\d+$/.test(topicId)) {
    const { data } = await (supabase as any)
      .from("content_catalog")
      .select("*")
      .eq("board", board)
      .eq("class_number", classNumber)
      .eq("topic_id", Number(topicId))
      .eq("content_type", "topic")
      .eq("is_active", true)
      .limit(5);

    if (Array.isArray(data) && data.length) {
      exactRows = data as CatalogRow[];
    }
  }

  if (!exactRows.length && chapterId && /^\d+$/.test(chapterId)) {
    const { data } = await (supabase as any)
      .from("content_catalog")
      .select("*")
      .eq("board", board)
      .eq("class_number", classNumber)
      .eq("chapter_id", Number(chapterId))
      .in("content_type", ["chapter", "topic"])
      .eq("is_active", true)
      .limit(50);

    if (Array.isArray(data) && data.length) {
      exactRows = data as CatalogRow[];
    }
  }

  if (!exactRows.length && subjectId && /^\d+$/.test(subjectId)) {
    const { data } = await (supabase as any)
      .from("content_catalog")
      .select("*")
      .eq("board", board)
      .eq("class_number", classNumber)
      .eq("subject_id", Number(subjectId))
      .eq("is_active", true)
      .limit(200);

    if (Array.isArray(data) && data.length) {
      exactRows = data as CatalogRow[];
    }
  }

  if (exactRows.length) {
    const topicRow =
      exactRows.find((r) => r.content_type === "topic") ||
      exactRows.find((r) => r.content_type === "chapter") ||
      exactRows[0];

    return {
      resolved: topicRow,
      matchType: "id_exact",
      score: 1,
    };
  }

  // 2) Smart match fallback
  let db = (supabase as any)
    .from("content_catalog")
    .select("*")
    .eq("board", board)
    .eq("class_number", classNumber)
    .eq("is_active", true);

  if (subjectNameHint?.trim()) {
    const ns = normalizeText(subjectNameHint);
    db = db.or(`normalized_subject.eq.${ns},subject_name.ilike.%${subjectNameHint.trim()}%`);
  }

  const { data, error } = await db.limit(500);
  if (error || !Array.isArray(data) || !data.length) return null;

  const rows = data as CatalogRow[];

  const queryParts = [
    topicNameHint?.trim() || "",
    chapterNameHint?.trim() || "",
  ].filter(Boolean);

  const query = queryParts.join(" ").trim();
  if (!query) return null;

  const matches = matchCatalogRows(rows, query);
  if (!matches.length) return null;

  return {
    resolved: matches[0].row,
    matchType: matches[0].matchType,
    score: matches[0].score,
  };
}


async function resolveTextbookSourceMap(args: {
  board: string;
  classNumber: number;
  subjectName: string;
  chapterName: string;
  topicName?: string | null;
}) {
  if (!supabaseUrl || !supabaseServiceKey) return null;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const board = String(args.board || "").trim().toLowerCase();
  const classNumber = Number(args.classNumber || 0);
  const subjectNorm = normalizeText(args.subjectName || "");
  const chapterNorm = normalizeText(args.chapterName || "");
  const topicNorm = normalizeText(args.topicName || "");

  const { data, error } = await (supabase as any)
    .from("textbook_source_map")
    .select("*")
    .eq("board", board)
    .eq("class_number", classNumber)
    .eq("is_active", true)
    .limit(200);

  if (error || !Array.isArray(data) || !data.length) return null;

  const rows = data as any[];

  const sameSubject = rows.filter((r) => (r.normalized_subject || "") === subjectNorm);
  const pool = sameSubject.length ? sameSubject : rows;

  // exact chapter match
  let exact =
    pool.find((r) => (r.normalized_chapter || "") === chapterNorm) || null;

  // exact topic match
  if (!exact && topicNorm) {
    exact =
      pool.find((r) => (r.normalized_topic || "") === topicNorm) || null;
  }

  // chapter alias match
  if (!exact) {
    exact =
      pool.find((r) =>
        Array.isArray(r.chapter_aliases) &&
        r.chapter_aliases.some((a: string) => normalizeText(a) === chapterNorm)
      ) || null;
  }

  // partial fallback
  if (!exact) {
    exact =
      pool.find((r) =>
        (r.normalized_chapter || "").includes(chapterNorm) ||
        chapterNorm.includes(r.normalized_chapter || "")
      ) || null;
  }

  // topic alias fallback
  if (!exact && topicNorm) {
    exact =
      pool.find((r) =>
        Array.isArray(r.topic_aliases) &&
        r.topic_aliases.some((a: string) => normalizeText(a) === topicNorm)
      ) || null;
  }

  return exact || null;
}
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const mobile = String(body?.mobile || "").trim();

    try {
      const h = headers();
      const host = h.get("x-forwarded-host") || h.get("host");
      const proto = h.get("x-forwarded-proto") || "http";
      const origin = host ? `${proto}://${host}` : "";

      if (origin) {
        const accessRes = await fetch(
          `${origin}/api/access/check?mobile=${encodeURIComponent(mobile)}`,
          { cache: "no-store" }
        );

        const access = await accessRes.json().catch(() => null);

        if (!accessRes.ok || !access?.ok) {
          return NextResponse.json(
            { ok: false, error: "Unable to verify plan right now." },
            { status: 503 }
          );
        }

        if (!access.allowed) {
          return NextResponse.json(
            { ok: false, error: "Trial ended. Please subscribe to generate notes." },
            { status: 403 }
          );
        }
      }
    } catch {
      // fail-open
    }

    const board = String(body?.board || "cbse").toLowerCase();
    const classId = String(body?.classId || "").trim();
    const courseType = String(body?.courseType || "regular").trim() || "regular";
    const subjectId = String(body?.subjectId || "").trim();
    const chapterId = String(body?.chapterId || "").trim();
    const topicIdRaw = body?.topicId;
    const topicId =
      topicIdRaw === null || topicIdRaw === undefined || String(topicIdRaw).trim() === ""
        ? null
        : String(topicIdRaw).trim();
    const noteType = body?.noteType;

    const classNum = Number(classId);
    if (
      !mobile ||
      !classId ||
      !subjectId ||
      !chapterId ||
      !isNoteType(noteType) ||
      !Number.isFinite(classNum) ||
      classNum < 6 ||
      classNum > 12
    ) {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    let supabase: ReturnType<typeof supabaseAdmin>;
    try {
      supabase = supabaseAdmin();
    } catch {
      return NextResponse.json({ ok: false, error: "Supabase env missing." }, { status: 500 });
    }

    let subjectName = subjectId;
    let chapterName = chapterId;
    let topicName = topicId || chapterId;
    let chapterType: string | null = null;
    let bookName: string | null = null;
    let resolvedMatchType: string | null = null;
    let resolvedMatchScore: number | null = null;

    // First, resolve names from regular hierarchy as before
    try {
      const isNumericSubject = /^\d+$/.test(subjectId);

      let subjectQuery = supabase
        .from("subjects")
        .select("id,subject_name,subject_code")
        .eq("board", board)
        .eq("class_number", classNum)
        .limit(1);

      subjectQuery = isNumericSubject
        ? subjectQuery.eq("id", Number(subjectId))
        : subjectQuery.eq("subject_code", subjectId);

      const { data: subjectData } = await subjectQuery.maybeSingle();
      if (subjectData?.subject_name) subjectName = subjectData.subject_name;

      const chapterIdNum = Number(chapterId);
      const { data: chapterData } = await supabase
        .from("chapters")
        .select("chapter_name")
        .eq("id", chapterIdNum)
        .eq("subject_id", subjectData?.id ?? -1)
        .limit(1)
        .maybeSingle();

      if (chapterData?.chapter_name) chapterName = chapterData.chapter_name;

      if (topicId && /^\d+$/.test(topicId)) {
        const topicIdNum = Number(topicId);
        const { data: topicData } = await supabase
          .from("topics")
          .select("topic_name")
          .eq("id", topicIdNum)
          .eq("chapter_id", chapterIdNum)
          .limit(1)
          .maybeSingle();

        if (topicData?.topic_name) topicName = topicData.topic_name;
      }
    } catch {
      // fail-soft
    }

    // Then improve/standardize through content_catalog
    try {
      const catalog = await resolveCatalogContext({
        board,
        classNumber: classNum,
        subjectId,
        chapterId,
        topicId,
        subjectNameHint: subjectName,
        chapterNameHint: chapterName,
        topicNameHint: topicName,
      });

      if (catalog?.resolved) {
        const row = catalog.resolved;
        subjectName = row.subject_name || subjectName;
        chapterName = row.chapter_name || chapterName;
        topicName = row.topic_name || topicName;
        chapterType = row.chapter_type || null;
        bookName = row.book_name || row.textbook_series || null;
        resolvedMatchType = catalog.matchType;
        resolvedMatchScore = catalog.score;
      }
    } catch (err) {
      console.error("catalog resolution failed in notes/generate:", err);
    }

    try {
      if (!bookName) {
        const mapped = await resolveTextbookSourceMap({
          board,
          classNumber: classNum,
          subjectName,
          chapterName,
          topicName,
        });

        if (mapped) {
          bookName = mapped.book_name || mapped.textbook_series || null;
          chapterType = mapped.chapter_type || chapterType;
          if (!resolvedMatchType) resolvedMatchType = "textbook_map";
          if (resolvedMatchScore == null) resolvedMatchScore = 0.96;
        }
      }
    } catch (err) {
      console.error("textbook source map resolution failed:", err);
    }

    try {
      const baseCacheQuery = supabase
        .from("notes_cache")
        .select("content,source,quality_score")
        .eq("board", board)
        .eq("class_id", classId)
        .eq("course_type", courseType)
        .eq("subject_id", subjectId)
        .eq("chapter_id", chapterId)
        .eq("note_type", noteType)
        .eq("version", CACHE_VERSION)
        .limit(1);

      const { data: cached, error: cacheErr } =
        topicId === null
          ? await baseCacheQuery.filter("topic_id", "is", null).maybeSingle()
          : await baseCacheQuery.eq("topic_id", topicId).maybeSingle();

      if (!cacheErr && cached?.content) {
        return NextResponse.json({
          ok: true,
          source: "cache",
          content: sanitizeGeneratedText(String(cached.content || "")),
          qualityScore: Number(cached.quality_score || 0),
          resolved: {
            subjectName,
            chapterName,
            topicName,
            chapterType,
            bookName,
            matchType: resolvedMatchType,
            score: resolvedMatchScore,
          },
        });
      }
    } catch {
      // fail-soft
    }

    const apiKey = process.env.OPENAI_API_KEY || process.env.NEOLEARN_OPENAI_API_KEY;

    let content = "";
    let source: "internal" | "openai" = "internal";
    let qualityScore = 0.45;

    if (apiKey) {
      try {
        const aiMarkdown = await buildOpenAiMarkdown({
          apiKey,
          board,
          classId,
          courseType,
          subjectName,
          chapterName,
          topicName,
          noteType,
          chapterType,
          bookName,
        });

        if (aiMarkdown) {
          content = sanitizeGeneratedText(aiMarkdown);
          source = "openai";
          qualityScore = 0.95;
        }
      } catch (err) {
        console.error("OpenAI notes fallback triggered:", err);
      }
    }

    if (!content) {
      const internal = buildInternalMarkdown({
        board,
        classId,
        subjectName,
        chapterName,
        topicName,
        noteType,
        chapterType,
      });
      content = sanitizeGeneratedText(internal.markdown);
      source = "internal";
      qualityScore = internal.qualityScore;
    }

    try {
      await supabase.from("notes_cache").insert({
        board,
        class_id: classId,
        course_type: courseType,
        subject_id: subjectId,
        chapter_id: chapterId,
        topic_id: topicId,
        note_type: noteType,
        format: "markdown",
        content,
        source,
        quality_score: qualityScore,
        version: CACHE_VERSION,
        created_by_mobile: mobile,
      });
    } catch (err) {
      console.error("notes_cache insert failed:", err);
    }

    return NextResponse.json({
      ok: true,
      source,
      content,
      qualityScore,
      resolved: {
        subjectName,
        chapterName,
        topicName,
        chapterType,
        bookName,
        matchType: resolvedMatchType,
        score: resolvedMatchScore,
      },
    });
  } catch (err: any) {
    console.error("notes/generate error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to generate notes." },
      { status: 500 }
    );
  }
}




