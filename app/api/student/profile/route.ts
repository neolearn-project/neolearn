import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(body: any, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mobile = String(searchParams.get("mobile") || "").trim();

    if (!mobile) {
      return noStoreJson(
        { ok: false, error: "Missing mobile." },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: rows, error } = await supabase
      .from("children")
      .select("id, parent_mobile, child_name, child_mobile, board, class_number, subject_type, language, country, created_at")
      .eq("child_mobile", mobile)
      .order("id", { ascending: false });

    if (error) {
      console.error("student child profile read error:", error);
      return noStoreJson(
        { ok: false, error: error.message || "Failed to load child profile." },
        { status: 500 }
      );
    }

    const children = Array.isArray(rows) ? rows : [];
    const child = children[0] || null;

    return noStoreJson({
      ok: true,
      student: {
        userId: null,
        username: null,
        name: child?.child_name || "Student",
        mobile,
        classId: child?.class_number != null ? String(child.class_number) : "6",
        board: child?.board || "CBSE",
        track: child?.subject_type || "regular",
        subjectType: child?.subject_type || "regular",
        competitiveExam:
          child?.subject_type === "competitive" ? child?.board || null : null,
      },
      sources: {
        childFound: !!child,
        childrenCount: children.length,
        selectedChildId: child?.id || null,
        selectedParentMobile: child?.parent_mobile || null,
      },
      debugChildren: children.map((c) => ({
        id: c.id,
        parent_mobile: c.parent_mobile,
        child_mobile: c.child_mobile,
        class_number: c.class_number,
        board: c.board,
        subject_type: c.subject_type,
        created_at: c.created_at,
      })),
    });
  } catch (err: any) {
    console.error("student profile route error:", err);
    return noStoreJson(
      { ok: false, error: err?.message || "Failed to load student profile." },
      { status: 500 }
    );
  }
}


