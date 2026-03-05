import { NextResponse } from "next/server";
import { headers } from "next/headers";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type NoteType = "full_exam_notes" | "quick_revision" | "important_qna" | "mcq_only";

const NOTE_TYPES: NoteType[] = [
  "full_exam_notes",
  "quick_revision",
  "important_qna",
  "mcq_only",
];

function isNoteType(value: unknown): value is NoteType {
  return typeof value === "string" && NOTE_TYPES.includes(value as NoteType);
}

function makeMcq(topicName: string, count = 10): string[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return `**${n}.** ${topicName} practice MCQ ${n}\n- A) Option 1\n- B) Option 2\n- C) Option 3\n- D) Option 4\n- **Answer:** ${["A", "B", "C", "D"][i % 4]}`;
  });
}

function makeQa(prefix: string, topicName: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `**Q${i + 1}.** ${prefix} question on ${topicName}?\n**A:** Model answer point ${i + 1} for ${topicName}.`);
}

function buildInternalMarkdown(args: {
  board: string;
  classId: string;
  subjectName: string;
  chapterName: string;
  topicName: string;
  noteType: NoteType;
}) {
  const { board, classId, subjectName, chapterName, topicName, noteType } = args;

  const mcq = makeMcq(topicName, noteType === "mcq_only" ? 15 : 10);
  const qa2 = makeQa("2-mark", topicName, 6);
  const qa5 = makeQa("5-mark", topicName, 4);
  const caseBased = makeQa("Case-based", topicName, 2);

  const markdown = `# ${subjectName} Notes (${chapterName})\n\n` +
`Board: ${board.toUpperCase()} | Class: ${classId} | Type: ${noteType}\n\n` +
`## Overview\n` +
`- This note covers **${topicName}** under **${chapterName}** for class ${classId}.\n\n` +
`## Key definitions\n` +
`- Definition 1 of ${topicName}.\n- Definition 2 of ${topicName}.\n- Definition 3 of ${topicName}.\n\n` +
`## Important points/formulas\n` +
`- Formula/point 1 for ${topicName}.\n- Formula/point 2 for ${topicName}.\n- Formula/point 3 for ${topicName}.\n\n` +
`## MCQ\n${mcq.join("\n\n")}\n\n` +
`## 2-mark Q&A\n${qa2.join("\n\n")}\n\n` +
`## 5-mark Q&A\n${qa5.join("\n\n")}\n\n` +
`## Case-based\n${caseBased.join("\n\n")}\n\n` +
`## Quick revision\n` +
`- Revise all definitions for ${topicName}.\n- Solve at least 10 MCQs from this sheet.\n- Practice 2-mark then 5-mark in that order.\n- Focus on mistakes and formula application.`;

  let qualityScore = 0;
  const hasAllSections = [
    "## Overview",
    "## Key definitions",
    "## Important points/formulas",
    "## MCQ",
    "## 2-mark Q&A",
    "## 5-mark Q&A",
    "## Case-based",
    "## Quick revision",
  ].every((s) => markdown.includes(s));

  if (hasAllSections) qualityScore += 0.2;
  if (mcq.length >= 10) qualityScore += 0.2;
  if (qa2.length >= 6) qualityScore += 0.2;
  if (qa5.length >= 4) qualityScore += 0.2;
  if (caseBased.length >= 2) qualityScore += 0.2;

  return { markdown, qualityScore };
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
}) {
  const client = new OpenAI({ apiKey: args.apiKey });
  const prompt = `Generate ${args.noteType} notes in Markdown.\nBoard: ${args.board}\nClass: ${args.classId}\nCourse: ${args.courseType}\nSubject: ${args.subjectName}\nChapter: ${args.chapterName}\nTopic: ${args.topicName}\n\nOutput ONLY Markdown and include EXACT sections:\n## Overview\n## Key definitions\n## Important points/formulas\n## MCQ\n## 2-mark Q&A\n## 5-mark Q&A\n## Case-based\n## Quick revision\n\nMinimum counts:\nMCQ >= 10\n2-mark >= 6\n5-mark >= 4\nCase-based >= 2`;

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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const mobile = String(body?.mobile || "").trim();
    // ✅ Access enforcement (temporary): reuse existing /api/access/check
    // Denied => 403 Trial ended
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
      // Fail-open (do not block) if access-check crashes unexpectedly
    }
    const board = String(body?.board || "cbse").toLowerCase();
    const classId = String(body?.classId || "").trim();
    const courseType = String(body?.courseType || "regular").trim() || "regular";
    const subjectId = String(body?.subjectId || "").trim();
    const chapterId = String(body?.chapterId || "").trim();
    const topicIdRaw = body?.topicId;
    const topicId = topicIdRaw === null || topicIdRaw === undefined || String(topicIdRaw).trim() === ""
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

    try {
    } catch (e: any) {
      if (e?.message === "ACCESS_DENIED") {
        return NextResponse.json(
          { ok: false, error: "Trial ended. Please subscribe to generate notes." },
          { status: 403 }
        );
      }
      throw e;
    }

    let supabase: ReturnType<typeof supabaseAdmin>;
    try {
      supabase = supabaseAdmin();
    } catch {
      return NextResponse.json({ ok: false, error: "Supabase env missing." }, { status: 500 });
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
        .eq("version", 1)
        .limit(1);

      const { data: cached, error: cacheErr } =
        topicId === null
          ? await baseCacheQuery.filter("topic_id", "is", null).maybeSingle()
          : await baseCacheQuery.eq("topic_id", topicId).maybeSingle();
      if (!cacheErr && cached?.content) {
        return NextResponse.json({
          ok: true,
          source: "cache",
          content: cached.content,
          qualityScore: Number(cached.quality_score || 0),
        });
      }
    } catch {
      // fail-soft if table missing
    }

    let subjectName = subjectId;
    let chapterName = chapterId;
    let topicName = topicId || chapterId;

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
      // fail-soft and continue with ids as labels
    }

    const internal = buildInternalMarkdown({
      board,
      classId,
      subjectName,
      chapterName,
      topicName,
      noteType,
    });

    let content = internal.markdown;
    let source: "internal" | "openai" = "internal";
    let qualityScore = internal.qualityScore;

    if (qualityScore < 0.75) {
      const apiKey = process.env.OPENAI_API_KEY || process.env.NEOLEARN_OPENAI_API_KEY;
      if (apiKey) {
        const aiMarkdown = await buildOpenAiMarkdown({
          apiKey,
          board,
          classId,
          courseType,
          subjectName,
          chapterName,
          topicName,
          noteType,
        });

        if (aiMarkdown) {
          content = aiMarkdown;
          source = "openai";
          qualityScore = 0.9;
        }
      }
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
        version: 1,
        created_by_mobile: mobile,
      });
    } catch {
      // fail-soft if table missing
    }

    return NextResponse.json({ ok: true, source, content, qualityScore });
  } catch (err: any) {
    console.error("notes/generate error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to generate notes." },
      { status: 500 }
    );
  }
}

