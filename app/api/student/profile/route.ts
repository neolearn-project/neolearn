import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mobile = String(searchParams.get("mobile") || "").trim();

    if (!mobile) {
      return NextResponse.json(
        { ok: false, error: "Missing mobile." },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // children table is the source of truth for parent-managed class upgrades
    const { data: child, error: childError } = await supabase
      .from("children")
      .select("child_name, child_mobile, board, class_number, created_at")
      .eq("child_mobile", mobile)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (childError) {
      console.error("student child profile read error:", childError);
      return NextResponse.json(
        { ok: false, error: childError.message || "Failed to load child profile." },
        { status: 500 }
      );
    }

    const classId =
      child?.class_number != null ? String(child.class_number) : "6";

    const board = child?.board || "CBSE";

    return NextResponse.json({
      ok: true,
      student: {
        userId: null,
        username: null,
        name: child?.child_name || "Student",
        mobile,
        classId,
        board,
      },
      sources: {
        childFound: !!child,
      },
    });
  } catch (err: any) {
    console.error("student profile route error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load student profile." },
      { status: 500 }
    );
  }
}
