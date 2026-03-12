import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabase() {
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL missing.");
  }
  if (!supabaseKey) {
    throw new Error("SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY missing.");
  }
  return createClient(supabaseUrl, supabaseKey);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const adminPw = String(body?.adminPassword || "");
    const studentMobile = String(body?.studentMobile || "").trim();
    const action = String(body?.action || "").trim();
    const reason = String(body?.reason || "").trim();
    const expiresAt = body?.expiresAt ? String(body.expiresAt) : null;

    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "neolearn-admin-secret";

    if (adminPw !== ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!/^\d{10}$/.test(studentMobile)) {
      return NextResponse.json({ ok: false, error: "Invalid student mobile." }, { status: 400 });
    }

    const supabase = getSupabase();

    if (action === "grant") {
      const { error } = await supabase.from("access_override").upsert(
        {
          student_mobile: studentMobile,
          is_active: true,
          reason: reason || "Manual admin override",
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_mobile" }
      );

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, message: "Access override granted." });
    }

    if (action === "revoke") {
      const { error } = await supabase
        .from("access_override")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("student_mobile", studentMobile);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, message: "Access override revoked." });
    }

    return NextResponse.json({ ok: false, error: "Invalid action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Access update failed." },
      { status: 500 }
    );
  }
}