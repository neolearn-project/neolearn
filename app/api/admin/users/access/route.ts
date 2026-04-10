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

function parseLimit(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const adminPw = String(body?.adminPassword || "");
    const studentMobile = String(body?.studentMobile || "").trim();
    const action = String(body?.action || "").trim();
    const reason = String(body?.reason || "").trim();
    const expiresAt = body?.expiresAt ? String(body.expiresAt) : null;
    const customLimit = parseLimit(body?.customLimit);
    const globalLimit = parseLimit(body?.globalLimit);

    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "neolearn-admin-secret";

    if (adminPw !== ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabase();

    if (action === "grant") {
      if (!/^\d{10}$/.test(studentMobile)) {
        return NextResponse.json({ ok: false, error: "Invalid student mobile." }, { status: 400 });
      }

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

await supabase.from("access_override_history").insert({
    student_mobile: studentMobile,
    action: "grant",
    reason: reason || "Manual admin override",
    expires_at: expiresAt,
    admin_actor: "admin",
  });

      return NextResponse.json({ ok: true, message: "Access override granted." });
    }

    if (action === "revoke") {
      if (!/^\d{10}$/.test(studentMobile)) {
        return NextResponse.json({ ok: false, error: "Invalid student mobile." }, { status: 400 });
      }

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

await supabase.from("access_override_history").insert({
    student_mobile: studentMobile,
    action: "revoke",
    reason: reason || "Override revoked",
    expires_at: null,
    admin_actor: "admin",
  });

      return NextResponse.json({ ok: true, message: "Access override revoked." });
    }

    if (action === "set_student_limit") {
      if (!/^\d{10}$/.test(studentMobile)) {
        return NextResponse.json({ ok: false, error: "Invalid student mobile." }, { status: 400 });
      }

      if (customLimit === null) {
        return NextResponse.json({ ok: false, error: "Invalid customLimit." }, { status: 400 });
      }

      const { error } = await supabase.from("student_access_policy").upsert(
        {
          student_mobile: studentMobile,
          custom_limit: customLimit,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_mobile" }
      );

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: "Student custom limit updated.",
        studentMobile,
        customLimit,
      });
    }

    if (action === "clear_student_limit") {
      if (!/^\d{10}$/.test(studentMobile)) {
        return NextResponse.json({ ok: false, error: "Invalid student mobile." }, { status: 400 });
      }

      const { error } = await supabase
        .from("student_access_policy")
        .delete()
        .eq("student_mobile", studentMobile);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: "Student custom limit cleared.",
        studentMobile,
      });
    }

    if (action === "set_global_limit") {
      if (globalLimit === null) {
        return NextResponse.json({ ok: false, error: "Invalid globalLimit." }, { status: 400 });
      }

      const { error } = await supabase.from("app_settings").upsert(
        {
          key: "student_free_limit",
          value: String(globalLimit),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: "Global free limit updated.",
        globalLimit,
      });
    }

    return NextResponse.json({ ok: false, error: "Invalid action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Access update failed." },
      { status: 500 }
    );
  }
}