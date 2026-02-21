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
    const body = await req.json();

    const userId = toSafeUserId(body?.userId);
    const mobile = String(body?.mobile || "").trim();
    const otp = String(body?.otp || "").trim();
    const newPassword = String(body?.newPassword || "").trim();

    if (!userId || userId.length < 3)
      return NextResponse.json({ error: "Invalid User ID." }, { status: 400 });

    if (!/^\d{10}$/.test(mobile))
      return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 });

    if (!otp)
      return NextResponse.json({ error: "OTP required." }, { status: 400 });

    if (!newPassword || newPassword.length < 6)
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );

    // ✅ Use current origin instead of NEXT_PUBLIC_SITE_URL
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

    // Update password
    const admin = supabaseAdmin();
    const email = toEmailFromUserId(userId);

    const { data: users, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 2000,
    });
    if (listErr)
      return NextResponse.json({ error: listErr.message }, { status: 500 });

    const user = users?.users?.find(
      (u) => (u.email || "").toLowerCase() === email.toLowerCase()
    );
    if (!user)
      return NextResponse.json({ error: "User not found." }, { status: 404 });

    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (updErr)
      return NextResponse.json({ error: updErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // ✅ show real error in terminal logs
    console.error("reset-password error:", e);
    return NextResponse.json(
      { error: e?.message || "Reset failed" },
      { status: 500 }
    );
  }
}
