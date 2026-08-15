import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

type ResetMode = "student" | "parent";

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

    const mode = normalizeMode(body?.role || body?.mode);
    const mobile = String(body?.mobile || "").replace(/\D/g, "").trim();
    const otp = String(body?.otp || "").replace(/\D/g, "").trim();
    const newPassword = String(body?.newPassword || "").trim();

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
    let email = "";
    let studentRecord: any = null;
    let shouldUpsertParentProfile = false;

    if (mode === "student") {
      const studentCheck = await admin
        .from("students")
        .select("id, user_id, phone, username, name, full_name")
        .eq("phone", mobile)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (studentCheck.error) {
        return NextResponse.json(
          { error: `Failed to validate student records. (${studentCheck.error.message})` },
          { status: 500 }
        );
      }

      if (!studentCheck.data?.username) {
        return NextResponse.json(
          { error: "Student mobile not found in our records." },
          { status: 404 }
        );
      }

      email = studentEmailFromUserId(String(studentCheck.data.username).trim().toLowerCase());
      studentRecord = studentCheck.data;
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

      email = parentEmailFromMobile(mobile);
      shouldUpsertParentProfile = !parentCheck.data || parentCheck.data.length === 0;
    }

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
      if (mode === "student") {
        const created = await admin.auth.admin.createUser({
          email,
          password: newPassword,
          email_confirm: true,
          user_metadata: {
            role: "student",
            username: studentRecord?.username,
            name: studentRecord?.full_name || studentRecord?.name || "Student",
            mobile,
          },
        });

        if (created.error || !created.data?.user) {
          return NextResponse.json(
            { error: created.error?.message || "Failed to recreate student account." },
            { status: 400 }
          );
        }

        await admin
          .from("students")
          .update({ user_id: created.data.user.id })
          .eq("phone", mobile);

        return NextResponse.json({ ok: true });
      }

      const created = await admin.auth.admin.createUser({
        email,
        password: newPassword,
        email_confirm: true,
        user_metadata: {
          role: "parent",
          name: "Parent",
          mobile,
        },
      });

      if (created.error || !created.data?.user) {
        return NextResponse.json(
          { error: created.error?.message || "Failed to recreate parent account." },
          { status: 400 }
        );
      }

      const profile = await admin.from("parent_profile").upsert(
        {
          user_id: created.data.user.id,
          full_name: "Parent",
          mobile,
          country: "India",
          preferred_language: "English",
        },
        { onConflict: "user_id" }
      );

      if (profile.error) {
        return NextResponse.json(
          { error: `Failed to update parent profile. (${profile.error.message})` },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(authUser.id, {
      password: newPassword,
    });

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    if (mode === "parent" && shouldUpsertParentProfile) {
      const profile = await admin.from("parent_profile").upsert(
        {
          user_id: authUser.id,
          full_name: "Parent",
          mobile,
          country: "India",
          preferred_language: "English",
        },
        { onConflict: "user_id" }
      );

      if (profile.error) {
        return NextResponse.json(
          { error: `Failed to update parent profile. (${profile.error.message})` },
          { status: 500 }
        );
      }
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
