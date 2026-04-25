import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { matchCatalogRows, normalizeText, type CatalogRow } from "@/app/lib/catalogMatch";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(req: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase server env vars are missing." },
        { status: 500 }
      );
    }

    const body = await req.json();

    const board = String(body?.board || "").trim().toLowerCase();
    const classIdRaw = body?.classId ?? body?.classNumber;
    const classNumber =
      typeof classIdRaw === "number"
        ? classIdRaw
        : parseInt(String(classIdRaw || ""), 10);

    const query = String(body?.query || "").trim();
    const subject = String(body?.subject || "").trim();
    const bookName = String(body?.bookName || "").trim();

    if (!board || !Number.isFinite(classNumber) || !query) {
      return NextResponse.json(
        { ok: false, error: "board, classId/classNumber, and query are required." },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let db = supabase
      .from("content_catalog")
      .select("*")
      .eq("board", board)
      .eq("class_number", classNumber)
      .eq("is_active", true);

    if (subject) {
      const normalizedSubject = normalizeText(subject);
      db = db.or(
        `normalized_subject.eq.${normalizedSubject},subject_name.ilike.%${subject}%`
      );
    }

    const { data, error } = await db.limit(500);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    let rows = (data || []) as CatalogRow[];

    if (bookName) {
      const nb = normalizeText(bookName);
      const filtered = rows.filter((r) => {
        const direct = (r.normalized_book || "") === nb || (r.normalized_book || "").includes(nb);
        const aliases = Array.isArray(r.book_aliases)
          ? r.book_aliases.some((a) => normalizeText(String(a)) === nb || normalizeText(String(a)).includes(nb))
          : false;
        return direct || aliases;
      });

      if (filtered.length) rows = filtered;
    }

    const matches = matchCatalogRows(rows, query).slice(0, 10);

    return NextResponse.json({
      ok: true,
      query,
      bestMatch: matches[0] || null,
      candidates: matches,
      candidateCount: matches.length,
    });
  } catch (err: any) {
    console.error("catalog/match error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
