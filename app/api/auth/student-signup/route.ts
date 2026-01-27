import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function toSafeUserId(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

function toEmailFromUserId(userId: string) {
  return `${userId}@neolearn.local`;
}

export async function POST(req: Request) {
  try {
const admin = supabaseAdmin();
    const body = await req.json();

    const rawUserId = String(body?.userId || "");
    const userId = toSafeUserId(rawUserId);
    const password = String(body?.password || "").trim();
    const name = String(body?.name || "").trim();
    const mobile = String(body?.mobile || "").trim();
    const classId = String(body?.classId || "6").trim();

    if (!userId || userId.length < 3) {
      return NextResponse.json(
        { error: "User ID must be at least 3 characters (letters/numbers only)." },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json({ error: "Student name required." }, { status: 400 });
    }

    if (!/^\d{10}$/.test(mobile)) {
      return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 });
    }

    const email = toEmailFromUserId(userId);

    // 1️⃣ Create Supabase Auth user
    const { data, error: authErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: "student",
          userId,
          mobile,
          name,
          classId,
        },
      });

    if (authErr || !data?.user) {
      return NextResponse.json(
        { error: authErr?.message || "Auth user creation failed" },
        { status: 400 }
      );
    }

    const uid = data.user.id;

    // 2️⃣ Create student_profile
    const { error: profileErr } = await admin
  .from("student_profile")
  .insert({
        student_id: uid,
        mobile,
        name,
        preferred_language: "en",
        preferred_speed: "normal",
        explain_style: "simple",
        weak_topic_ids: [],
        persona_summary: "",
      });

    if (profileErr) {
      return NextResponse.json(
        { error: profileErr.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      studentId: uid,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Signup failed" },
      { status: 500 }
    );
  }
}
