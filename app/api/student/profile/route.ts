import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  OwnershipError,
  ownershipErrorResponse,
  requireStudentMobile,
} from "@/lib/auth/ownership";

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

    await requireStudentMobile(req, mobile);
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

    let studentRow: any = null;
    let profileRow: any = null;

    if (!child) {
      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("id, user_id, username, name, full_name, phone, class_label, class, guardian_phone")
        .eq("phone", mobile)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (studentError) {
        console.warn("student profile students fallback skipped:", studentError.message);
      } else {
        studentRow = studentData;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("student_profile")
        .select("*")
        .eq("mobile", mobile)
        .limit(1)
        .maybeSingle();

      if (profileError) {
        console.warn("student profile profile fallback skipped:", profileError.message);
      } else {
        profileRow = profileData;
      }
    }

    const fallbackClass = String(
      profileRow?.class_id ||
        profileRow?.classId ||
        String(studentRow?.class_label || studentRow?.class || "").replace(/\D/g, "") ||
        "6"
    );
    const fallbackTrack = profileRow?.track || profileRow?.subject_type || "regular";
    const fallbackBoard = profileRow?.board || "CBSE";

    return noStoreJson({
      ok: true,
      student: {
        userId: studentRow?.user_id || studentRow?.id || null,
        username: studentRow?.username || profileRow?.username || null,
        name: child?.child_name || studentRow?.full_name || studentRow?.name || profileRow?.full_name || profileRow?.name || "Student",
        mobile,
        classId: child?.class_number != null ? String(child.class_number) : fallbackClass,
        board: child?.board || fallbackBoard,
        track: child?.subject_type || fallbackTrack,
        subjectType: child?.subject_type || fallbackTrack,
        competitiveExam:
          (child?.subject_type || fallbackTrack) === "competitive"
            ? child?.board || fallbackBoard || null
            : null,
      },
      sources: {
        childFound: !!child,
        studentFound: !!studentRow,
        profileFound: !!profileRow,
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
    if (err instanceof OwnershipError) return ownershipErrorResponse(err);
    console.error("student profile route error:", err);
    return noStoreJson(
      { ok: false, error: err?.message || "Failed to load student profile." },
      { status: 500 }
    );
  }
}


