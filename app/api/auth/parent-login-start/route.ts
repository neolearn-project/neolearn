import { NextResponse } from "next/server";
import twilio from "twilio";

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parentMobile = String(body?.parentMobile || body?.mobile || "").trim();

    if (!isValidIndianMobile(parentMobile)) {
      return NextResponse.json(
        { ok: false, error: "Enter valid parent mobile (10 digits)." },
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

    const phone = toE164India(parentMobile);
    const client = twilio(accountSid, authToken);

    await client.verify.v2.services(verifySid).verifications.create({
      to: phone,
      channel: "sms",
    });

    return NextResponse.json({ ok: true, otpToken: phone, otpMobile: parentMobile });
  } catch (err: any) {
    console.error("parent-login-start error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to send parent OTP." },
      { status: 500 }
    );
  }
}
