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

function studentEmailFromUserId(userId: string) {
  return `${userId.trim().toLowerCase()}@neolearn.in`;
}

function parentEmailFromMobile(mobile: string) {
  return `parent_${mobile.replace(/\D/g, "")}@neolearn.in`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const adminPw = String(body?.adminPassword || "");
    const mode = String(body?.mode || "").trim().toLowerCase();
    const userId = String(body?.userId || "").trim().toLowerCase();
    const mobile = String(body?.mobile || "").replace(/\D/g, "").trim();
    const newPassword = String(body?.newPassword || "").trim();

    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "neolearn-admin-secret";

    if (adminPw !== ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { ok: false, error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    let email = "";

    if (mode === "student") {
      if (!userId) {
        return NextResponse.json({ ok: false, error: "Missing student user ID." }, { status: 400 });
      }
      email = studentEmailFromUserId(userId);
    } else if (mode === "parent") {
      if (!/^\d{10}$/.test(mobile)) {
        return NextResponse.json({ ok: false, error: "Invalid parent mobile." }, { status: 400 });
      }
      email = parentEmailFromMobile(mobile);
    } else {
      return NextResponse.json({ ok: false, error: "Invalid mode." }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data: usersPage, error: listErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 2000,
    });

    if (listErr) {
      return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 });
    }

    const authUser = usersPage?.users?.find(
      (u) => (u.email || "").toLowerCase() === email.toLowerCase()
    );

    if (!authUser) {
      return NextResponse.json({ ok: false, error: "Auth user not found." }, { status: 404 });
    }

    const { error: updErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: newPassword,
    });

    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: "Password reset successful." });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Admin password reset failed." },
      { status: 500 }
    );
  }
}