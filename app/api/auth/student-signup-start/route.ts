import { NextResponse } from "next/server";
import twilio from "twilio";

function toE164India(mobile: string) {
  const m = mobile.replace(/\D/g, "");
  if (m.length === 10) return `+91${m}`;
  if (m.startsWith("91") && m.length === 12) return `+${m}`;
  if (m.startsWith("+")) return m;
  return `+${m}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = (body?.name || "").trim();
    const mobile = (body?.mobile || "").trim();
    const username = (body?.username || "").trim().toLowerCase();
    const classId = String(body?.classId || "6").trim();

    if (!name || !mobile || !username || !classId) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (!/^\d{10}$/.test(mobile.replace(/\D/g, ""))) {
      return NextResponse.json({ error: "Enter valid 10-digit mobile." }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID!;

    if (!accountSid || !authToken || !verifySid) {
      return NextResponse.json({ error: "Twilio config missing in env." }, { status: 500 });
    }

    const client = twilio(accountSid, authToken);
    const phone = toE164India(mobile);

    await client.verify.v2
      .services(verifySid)
      .verifications.create({ to: phone, channel: "sms" });

    // We return otpToken just to keep UI simple.
    // We'll use phone (E.164) as otpToken.
    return NextResponse.json(
      { ok: true, otpToken: phone },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("student-signup-start error:", err);
    return NextResponse.json({ error: "Failed to send OTP." }, { status: 500 });
  }
}
