import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

type ResetMode = "student" | "parent";

function toSafeUserId(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

function studentEmailFromUserId(userId: string) {
  return `${userId}@neolearn.in`;
}

function parentEmailFromMobile(mobile: string) {
  return `parent_${mobile.replace(/\D/g, "")}@neolearn.in`;
}

function normalizeMode(value: unknown): ResetMode {
  return String(value || "").trim().toLowerCase() === "parent" ? "parent" : "student";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const mode = normalizeMode(body?.mode);
    const userId = toSafeUserId(body?.userId);
    const mobile = String(body?.mobile || "").replace(/\D/g, "").trim();
    const otp = String(body?.otp || "").replace(/\D/g, "").trim();
    const newPassword = String(body?.newPassword || "").trim();

    if (mode === "student" && (!userId || userId.length < 3)) {
      return NextResponse.json({ error: "Invalid Student User ID." }, { status: 400 });
    }

    if (!/^\d{10}$/.test(mobile)) {
      return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 });
    }

    if (!otp) {
      return NextResponse.json({ error: "OTP required." }, { status: 400 });
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const origin = new URL(req.url).origin;
    const verifyUrl = `${origin}/api/auth/verify-otp`;

    const verifyRes = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile, otp }),
      cache: "no-store",
    });

    const verifyJson = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok) {
      return NextResponse.json(
        { error: verifyJson?.error || "OTP verification failed." },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();

    if (mode === "student") {
      const studentCheck = await admin
        .from("students")
        .select("id, phone, username")
        .eq("username", userId)
        .eq("phone", mobile)
        .limit(1);

      if (studentCheck.error) {
        return NextResponse.json(
          { error: `Failed to validate student records. (${studentCheck.error.message})` },
          { status: 500 }
        );
      }

      if (!studentCheck.data || studentCheck.data.length === 0) {
        return NextResponse.json(
          { error: "Student User ID and mobile do not match our records." },
          { status: 404 }
        );
      }
    }

    if (mode === "parent") {
      const parentCheck = await admin
        .from("parent_profile")
        .select("user_id, mobile")
        .eq("mobile", mobile)
        .limit(1);

      if (parentCheck.error) {
        return NextResponse.json(
          { error: `Failed to validate parent records. (${parentCheck.error.message})` },
          { status: 500 }
        );
      }

      if (!parentCheck.data || parentCheck.data.length === 0) {
        return NextResponse.json(
          { error: "Parent mobile not found in our records." },
          { status: 404 }
        );
      }
    }

    const email =
      mode === "parent"
        ? parentEmailFromMobile(mobile)
        : studentEmailFromUserId(userId);

    const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 2000,
    });

    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 });
    }

    const authUser = usersPage?.users?.find(
      (u) => (u.email || "").toLowerCase() === email.toLowerCase()
    );

    if (!authUser) {
      return NextResponse.json({ error: "Auth user not found." }, { status: 404 });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(authUser.id, {
      password: newPassword,
    });

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("reset-password error:", e);
    return NextResponse.json(
      { error: e?.message || "Reset failed" },
      { status: 500 }
    );
  }
}