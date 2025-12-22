// app/api/parent/children/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Reuse same pattern as other server routes
function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase server env vars are missing.");
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/parent/children?parentMobile=9XXXXXXXXX
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parentMobile = searchParams.get("parentMobile");

    if (!parentMobile) {
      return NextResponse.json(
        { ok: false, error: "parentMobile is required." },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("children")
      .select("*")
      .eq("parent_mobile", parentMobile)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("children GET error:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to load children from Supabase." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, children: data ?? [] });
  } catch (err) {
    console.error("children GET unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

// POST /api/parent/children
// body: { parentMobile, childName, childMobile, board, classNumber }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parentMobile = (body.parentMobile as string | undefined)?.trim();
    const childName = (body.childName as string | undefined)?.trim();
    const childMobile = (body.childMobile as string | undefined)?.trim();
    const board = (body.board as string | undefined)?.trim();
    const classNumberRaw = body.classNumber;

    if (!parentMobile || !childName || !childMobile || !board) {
      return NextResponse.json(
        { ok: false, error: "All fields are required." },
        { status: 400 }
      );
    }

    const classNumber = Number(classNumberRaw || 6);
    if (!Number.isFinite(classNumber) || classNumber <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid classNumber." },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    // If same (parent_mobile, child_mobile) already exists -> update row instead of duplicate
    const { data: existing, error: existingErr } = await supabase
      .from("children")
      .select("id")
      .eq("parent_mobile", parentMobile)
      .eq("child_mobile", childMobile)
      .maybeSingle();

    if (existingErr) {
      console.error("children existing check error:", existingErr);
    }

    if (existing) {
      const { data: updated, error: updateErr } = await supabase
        .from("children")
        .update({
          child_name: childName,
          board,
          class_number: classNumber,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateErr || !updated) {
        console.error("children update error:", updateErr);
        return NextResponse.json(
          { ok: false, error: "Failed to update child profile." },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, child: updated, mode: "updated" });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("children")
      .insert({
        parent_mobile: parentMobile,
        child_name: childName,
        child_mobile: childMobile,
        board,
        class_number: classNumber,
      })
      .select("*")
      .single();

    if (insertErr || !inserted) {
      console.error("children insert error:", insertErr);
      return NextResponse.json(
        { ok: false, error: "Failed to add child profile." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, child: inserted, mode: "inserted" });
  } catch (err) {
    console.error("children POST unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
