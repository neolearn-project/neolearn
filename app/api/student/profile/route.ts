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

    // Do not select board here because older student_profile schema may not have it.
    const profileRes = await supabase
      .from("student_profile")
      .select("user_id, username, full_name, class_id, mobile")
      .eq("mobile", mobile)
      .maybeSingle();

    if (profileRes.error) {
      console.warn("student profile read warning:", profileRes.error);
    }

    // Parent dashboard children table is the latest source for class upgrade.
    const childRes = await supabase
      .from("children")
      .select("child_name, child_mobile, board, class_number, updated_at, created_at")
      .eq("child_mobile", mobile)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (childRes.error) {
      console.warn("student child profile read warning:", childRes.error);
    }

    const profile = profileRes.data || null;
    const child = childRes.data || null;

    const classId =
      child?.class_number != null
        ? String(child.class_number)
        : profile?.class_id
        ? String(profile.class_id)
        : "6";

    const board = child?.board || "CBSE";

    return NextResponse.json({
      ok: true,
      student: {
        userId: profile?.user_id || null,
        username: profile?.username || null,
        name: profile?.full_name || child?.child_name || "Student",
        mobile,
        classId,
        board,
      },
      sources: {
        profileFound: !!profile,
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
