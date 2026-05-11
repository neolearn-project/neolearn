// app/api/syllabus/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SubjectRow = {
  id: number;
  board: string;
  class_number: number;
  subject_code: string;
  subject_name: string;
};

type ChapterRow = {
  id: number;
  subject_id: number;
  chapter_number: number;
  chapter_name: string;
};

type TopicRow = {
  id: number;
  chapter_id: number;
  topic_number: number;
  topic_name: string;
  content: any;
  is_active: boolean;
};

async function fetchAllRows<T>(
  queryFactory: (
    from: number,
    to: number
  ) => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const all: T[] = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await queryFactory(from, to);

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    all.push(...rows);

    if (rows.length < pageSize) break;

    from += pageSize;
  }

  return all;
}

export async function GET(req: Request) {
  const admin = supabaseAdmin();

  const { searchParams } = new URL(req.url);

  const classStr = (searchParams.get("class") || "6").trim();
  const boardRaw = (searchParams.get("board") || "cbse").trim();

  const classNumber = Number(classStr);
  const board = boardRaw.toLowerCase();

  if (!board || Number.isNaN(classNumber)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid class/board" },
      { status: 400 }
    );
  }

  try {
    // 1) SUBJECTS
    const { data: subjectsData, error: subjectsError } = await admin
      .from("subjects")
      .select("id, board, class_number, subject_code, subject_name")
      .eq("class_number", classNumber)
      .ilike("board", board)
      .order("subject_name", { ascending: true });

    if (subjectsError) {
      console.error("subjectsError", subjectsError);
      throw subjectsError;
    }

    const subjects = (subjectsData ?? []) as SubjectRow[];

    if (subjects.length === 0) {
      return NextResponse.json({
        ok: true,
        data: { subjects: [], chapters: [], topics: [] },
      });
    }

    const subjectIds = subjects.map((s) => s.id);

    // 2) CHAPTERS - paginated to avoid Supabase default 1000 limit
    const chapters = await fetchAllRows<ChapterRow>(async (from, to) =>
      await admin
        .from("chapters")
        .select("id, subject_id, chapter_number, chapter_name")
        .in("subject_id", subjectIds)
        .order("subject_id", { ascending: true })
        .order("chapter_number", { ascending: true })
        .range(from, to)
    );

    if (chapters.length === 0) {
      return NextResponse.json({
        ok: true,
        data: { subjects, chapters: [], topics: [] },
      });
    }

    const chapterIds = chapters.map((c) => c.id);

    // 3) TOPICS - paginated to avoid Supabase default 1000 limit
    const topics = await fetchAllRows<TopicRow>(async (from, to) =>
      await admin
        .from("topics")
        .select("id, chapter_id, topic_number, topic_name, content, is_active")
        .in("chapter_id", chapterIds)
        .eq("is_active", true)
        .order("chapter_id", { ascending: true })
        .order("topic_number", { ascending: true })
        .range(from, to)
    );

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

