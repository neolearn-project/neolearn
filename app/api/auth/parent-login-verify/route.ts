import { NextResponse } from "next/server";
import twilio from "twilio";
import { supabaseAdmin, supabasePublic } from "@/lib/supabaseAdmin";

function parentMobileToEmail(mobile: string) {
  return `parent_${mobile.replace(/\D/g, "")}@neolearn.in`;
}

function toE164India(mobile: string) {
  const raw = String(mobile || "").trim();
  if (raw.startsWith("+")) return raw;

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  return `+${digits}`;
}

function isValidIndianMobile(mobile: string) {
  return /^\d{10}$/.test(String(mobile || "").replace(/\D/g, ""));
}

async function findParentUser(admin: ReturnType<typeof supabaseAdmin>, email: string) {
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error(`Failed to validate parent account. (${users.error.message})`);

  return (users.data?.users || []).find(
    (user) => user.email?.toLowerCase() === email.toLowerCase()
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const otpToken = String(body?.otpToken || "").trim();
    const otp = String(body?.otp || body?.code || "").replace(/\D/g, "").trim();
    const parentMobile = String(body?.parentMobile || body?.mobile || "").trim();
    const parentName = String(body?.parentName || "Parent").trim() || "Parent";

    if (!otpToken || !otp) {
      return NextResponse.json({ ok: false, error: "Missing OTP token or OTP." }, { status: 400 });
    }

    if (!isValidIndianMobile(parentMobile)) {
      return NextResponse.json(
        { ok: false, error: "Enter valid parent mobile (10 digits)." },
        { status: 400 }
      );
    }

    if (!/^\d{4,10}$/.test(otp)) {
      return NextResponse.json({ ok: false, error: "Enter a valid OTP." }, { status: 400 });
    }

    const expectedPhone = toE164India(parentMobile);
    if (otpToken !== expectedPhone) {
      return NextResponse.json(
        { ok: false, error: "OTP session mismatch. Please start parent login again." },
        { status: 400 }
      );
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (!accountSid || !authToken || !verifySid) {
      return NextResponse.json(
        { ok: false, error: "Twilio config missing in env." },
        { status: 500 }
      );
    }

    const twilioClient = twilio(accountSid, authToken);
    const check = await twilioClient.verify.v2.services(verifySid).verificationChecks.create({
      to: expectedPhone,
      code: otp,
    });

    if (check.status !== "approved") {
      return NextResponse.json({ ok: false, error: "Invalid OTP." }, { status: 401 });
    }

    const admin = supabaseAdmin();
    const email = parentMobileToEmail(parentMobile);
    let parentUser = await findParentUser(admin, email);

    if (!parentUser) {
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          role: "parent",
          name: parentName,
          mobile: parentMobile,
        },
      });

      if (created.error || !created.data?.user) {
        return NextResponse.json(
          { ok: false, error: created.error?.message || "Failed to create parent account." },
          { status: 400 }
        );
      }

      parentUser = created.data.user;
    }

    const profile = await admin.from("parent_profile").upsert(
      {
        user_id: parentUser.id,
        full_name: parentName,
        mobile: parentMobile,
        country: "India",
        preferred_language: "English",
      },
      { onConflict: "user_id" }
    );

    if (profile.error) {
      return NextResponse.json(
        { ok: false, error: `Failed to update parent profile. (${profile.error.message})` },
        { status: 500 }
      );
    }

    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (link.error || !link.data?.properties?.hashed_token) {
      return NextResponse.json(
        { ok: false, error: link.error?.message || "Failed to create parent session." },
        { status: 500 }
      );
    }

    const auth = supabasePublic();
    const verified = await auth.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.data.properties.hashed_token,
    });

    if (verified.error || !verified.data?.session || !verified.data?.user) {
      return NextResponse.json(
        { ok: false, error: verified.error?.message || "Failed to verify parent session." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      parent: {
        userId: parentUser.id,
        mobile: parentMobile,
        name: parentName,
      },
      session: {
        access_token: verified.data.session.access_token,
        refresh_token: verified.data.session.refresh_token,
        expires_at: verified.data.session.expires_at,
      },
    });
  } catch (err: any) {
    console.error("parent-login-verify error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Parent OTP verification failed." },
      { status: 500 }
    );
  }
}
