import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getAdminClient() {
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing.");
  if (!supabaseServiceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing.");
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parentMobile = String(body.parentMobile || "").trim();
    const childMobile = String(body.childMobile || "").trim();
    const board = String(body.board || "CBSE").trim();
    const classNumber = Number(body.classNumber);

    if (!parentMobile || !childMobile) {
      return NextResponse.json(
        { ok: false, error: "parentMobile and childMobile are required." },
        { status: 400 }
      );
    }

    if (!/^\d{10}$/.test(childMobile)) {
      return NextResponse.json(
        { ok: false, error: "Invalid child mobile." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(classNumber) || classNumber < 6 || classNumber > 12) {
      return NextResponse.json(
        { ok: false, error: "Class must be between 6 and 12." },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const nowIso = new Date().toISOString();

    // 1) Verify this parent owns this child.
    const { data: ownedChild, error: ownedErr } = await supabase
      .from("children")
      .select("*")
      .eq("parent_mobile", parentMobile)
      .eq("child_mobile", childMobile)
      .maybeSingle();

    if (ownedErr) {
      console.error("child ownership check error:", ownedErr);
      return NextResponse.json(
        { ok: false, error: ownedErr.message || "Failed to verify child." },
        { status: 500 }
      );
    }

    if (!ownedChild) {
      return NextResponse.json(
        { ok: false, error: "Child not found for this parent." },
        { status: 404 }
      );
    }

    // 2) Update all rows for this child mobile.
    // This handles duplicate children rows created earlier.
    const { data: updatedChildren, error: updateErr } = await supabase
      .from("children")
      .update({
        board,
        class_number: classNumber,
      })
      .eq("child_mobile", childMobile)
      .select("*");

    if (updateErr) {
      console.error("child class update children error:", updateErr);
      return NextResponse.json(
        { ok: false, error: updateErr.message || "Failed to update child row." },
        { status: 500 }
      );
    }

    const childRow =
      (updatedChildren || []).find((c) => c.parent_mobile === parentMobile) ||
      (updatedChildren || [])[0] ||
      ownedChild;

    // 3) Best-effort student_profile sync.
    let profileWarning: string | null = null;

    const profileFull = await supabase
      .from("student_profile")
      .update({
        board,
        class_id: String(classNumber),
        updated_at: nowIso,
      })
      .eq("mobile", childMobile);

    if (profileFull.error) {
      const msg = String(profileFull.error.message || "").toLowerCase();

      if (msg.includes("board") || msg.includes("schema cache")) {
        const profileClassOnly = await supabase
          .from("student_profile")
          .update({
            class_id: String(classNumber),
            updated_at: nowIso,
          })
          .eq("mobile", childMobile);

        if (profileClassOnly.error) {
          profileWarning = profileClassOnly.error.message;
          console.warn("student_profile class-only sync skipped:", profileClassOnly.error);
        }
      } else {
        profileWarning = profileFull.error.message;
        console.warn("student_profile sync skipped:", profileFull.error);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Child class updated successfully.",
      child: childRow,
      updatedChildrenCount: updatedChildren?.length || 0,
      classNumber,
      board,
      profileWarning,
    });
  } catch (err: any) {
    console.error("child class update unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
