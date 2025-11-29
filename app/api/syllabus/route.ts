// app/api/syllabus/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const classParam = searchParams.get("class");
  const boardParam = searchParams.get("board");

  const classNumber = classParam ? parseInt(classParam, 10) : NaN;
  const board = boardParam?.toLowerCase();

  if (!board || Number.isNaN(classNumber)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid class/board" },
      { status: 400 }
    );
  }

  try {
    // 1) SUBJECTS
    const { data: subjects, error: subjectsError } = await supabaseAdmin
      .from("subjects")
      .select(
        `
        id,
        board,
        class_number,
        subject_code,
        subject_name
      `
      )
      .eq("board", board)
      .eq("class_number", classNumber);

    if (subjectsError) {
      console.error("subjectsError", subjectsError);
      throw subjectsError;
    }

    if (!subjects || subjects.length === 0) {
      return NextResponse.json({
        ok: true,
        data: { subjects: [], chapters: [], topics: [] },
      });
    }

    const subjectIds = subjects.map((s) => s.id);

    // 2) CHAPTERS
    const { data: chapters, error: chaptersError } = await supabaseAdmin
      .from("chapters")
      .select(
        `
        id,
        subject_id,
        chapter_number,
        chapter_name
      `
      )
      .in("subject_id", subjectIds)
      .order("chapter_number", { ascending: true });

    if (chaptersError) {
      console.error("chaptersError", chaptersError);
      throw chaptersError;
    }

    const chapterIds = chapters.map((c) => c.id);

    // 3) TOPICS
    let topics: any[] = [];
    if (chapterIds.length > 0) {
      const { data: topicsData, error: topicsError } = await supabaseAdmin
        .from("topics")
        .select(
          `
          id,
          chapter_id,
          topic_number,
          topic_name,
          content,
          is_active
        `
        )
        .in("chapter_id", chapterIds)
        .order("topic_number", { ascending: true });

      if (topicsError) {
        console.error("topicsError", topicsError);
        throw topicsError;
      }

      topics = topicsData ?? [];
    }

    return NextResponse.json({
      ok: true,
      data: {
        subjects,
        chapters,
        topics,
      },
    });
  } catch (err: any) {
    console.error("syllabusError", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Unknown syllabus error",
      },
      { status: 500 }
    );
  }
}
