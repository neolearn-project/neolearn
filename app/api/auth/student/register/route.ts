import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = String(body?.name || "").trim();
    const classId = String(body?.classId || "6").trim();
    const mobile10 = String(body?.mobile || "").trim(); // 10 digits
    const password = String(body?.password || "").trim();

    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    if (!/^\d{10}$/.test(mobile10)) return NextResponse.json({ error: "Invalid mobile" }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: "Password must be at least 6 chars" }, { status: 400 });

    // IMPORTANT:
    // We assume you already verified OTP via /api/auth/verify-otp before calling this route.
    // So here we directly create the Supabase Auth user and mark phone confirmed.

    const phoneE164 = `+91${mobile10}`;

    // Create Auth user (admin)
    const supabase = supabaseAdmin();

const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  phone: phoneE164,
  password,
  phone_confirm: true,
      user_metadata: { name, classId, mobile: mobile10 },
    });

    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 400 });
    }

    const user = created.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Auth user not created" }, { status: 500 });
    }

    // OPTIONAL: store mapping in your DB (recommended)
    // Add a column in student_profile: auth_user_id uuid unique
    const { error: upsertErr } = await supabase
  .from("student_profile")
  .upsert(
    {
          auth_user_id: user.id,
          mobile: mobile10,
          name,
          class_id: classId,
        },
        { onConflict: "auth_user_id" }
      );

    if (upsertErr) {
      // If table/columns not ready, you can comment this temporarily
      return NextResponse.json({ error: upsertErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Register failed" }, { status: 500 });
  }
}
