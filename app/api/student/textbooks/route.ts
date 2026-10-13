import { NextRequest, NextResponse } from "next/server";
import {
  OwnershipError,
  ownershipErrorResponse,
  requireStudentIdentity,
} from "@/lib/auth/ownership";
import { eligiblePublishedTextbooks } from "@/app/lib/studentTextbookAccess.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SIGNED_URL_SECONDS = 90;

function positiveId(value: string | null) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" },
  });
}

async function loadStudentCurriculum(identity: Awaited<ReturnType<typeof requireStudentIdentity>>) {
  const db = identity.admin;
  const { data: child, error: childError } = await db
    .from("children")
    .select("board,class_number,subject_type")
    .eq("child_mobile", identity.mobile)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (childError) throw new Error("Unable to verify the student curriculum.");
  if (child) {
    return { board: child.board, classNumber: child.class_number, track: child.subject_type };
  }

  const { data: profile, error: profileError } = await db
    .from("student_profile")
    .select("*")
    .eq("mobile", identity.mobile)
    .limit(1)
    .maybeSingle();
  if (profileError) throw new Error("Unable to verify the student curriculum.");
  if (!profile) {
    const { data: studentRow, error: studentError } = await db
      .from("students")
      .select("class_label,class")
      .eq("phone", identity.mobile)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (studentError) throw new Error("Unable to verify the student curriculum.");
    return {
      board: "CBSE",
      classNumber: String(studentRow?.class_label || studentRow?.class || "").replace(/\D/g, ""),
      track: "regular",
    };
  }
  return {
    board: profile?.board,
    classNumber: profile?.class_id,
    track: profile?.subject_type || profile?.track,
  };
}

export async function GET(req: NextRequest) {
  try {
    const subjectId = positiveId(req.nextUrl.searchParams.get("subjectId"));
    const chapterId = positiveId(req.nextUrl.searchParams.get("chapterId"));
    const topicId = positiveId(req.nextUrl.searchParams.get("topicId"));
    if (!subjectId || !chapterId) {
      return json({ ok: false, error: "Select a subject and chapter first." }, 400);
    }

    const identity = await requireStudentIdentity(req);
    const student = await loadStudentCurriculum(identity);
    if (!student.board || !student.classNumber || String(student.track || "regular").toLowerCase() === "competitive") {
      return json({ ok: true, books: [], message: "No eligible textbook is available for this chapter." });
    }

    const db = identity.admin;
    const [{ data: subject, error: subjectError }, { data: chapter, error: chapterError }] =
      await Promise.all([
        db.from("subjects").select("id,board,class_number,subject_name").eq("id", subjectId).maybeSingle(),
        db.from("chapters").select("id,subject_id").eq("id", chapterId).eq("subject_id", subjectId).maybeSingle(),
      ]);
    if (subjectError || chapterError) throw new Error("Unable to verify the selected curriculum.");
    if (!subject || !chapter) return json({ ok: false, error: "The selected chapter is not available." }, 404);

    if (topicId) {
      const { data: topic, error: topicError } = await db
        .from("topics")
        .select("id")
        .eq("id", topicId)
        .eq("chapter_id", chapterId)
        .eq("is_active", true)
        .maybeSingle();
      if (topicError) throw new Error("Unable to verify the selected topic.");
      if (!topic) return json({ ok: false, error: "The selected topic is not available." }, 404);
    }

    let mappingQuery = db
      .from("textbook_topic_mappings")
      .select("page_from,page_to,topic_id,source:textbook_sources!inner(id,board,class_number,subject,book_name,edition,storage_path,status,published_at,unpublished_at)")
      .eq("subject_id", subjectId)
      .eq("chapter_id", chapterId);
    if (topicId) mappingQuery = mappingQuery.eq("topic_id", topicId);
    const { data: mappings, error: mappingError } = await mappingQuery.limit(100);
    if (mappingError) throw new Error("Unable to find textbooks right now.");

    const eligible = eligiblePublishedTextbooks({ mappings, student, subject });
    const books = [];
    for (const book of eligible) {
      const { data, error } = await db.storage
        .from("textbook-pdfs")
        .createSignedUrl(book.storagePath, SIGNED_URL_SECONDS);
      if (!error && data?.signedUrl) {
        books.push({
          title: book.title,
          edition: book.edition,
          page: book.page,
          url: data.signedUrl,
        });
      }
    }

    return json({
      ok: true,
      books,
      message: books.length ? undefined : "No eligible textbook is available for this chapter.",
    });
  } catch (error) {
    if (error instanceof OwnershipError) return ownershipErrorResponse(error);
    console.error("student textbook access error:", error);
    return json({ ok: false, error: "Textbooks are temporarily unavailable. Please try again." }, 503);
  }
}
