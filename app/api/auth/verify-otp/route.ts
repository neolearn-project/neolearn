import { NextResponse } from "next/server";
import Twilio from "twilio";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mobile = String(body?.mobile || "").replace(/\D/g, "").trim();
    const otp = String(body?.otp || body?.code || "").replace(/\D/g, "").trim();

    // ✅ India mobile (10-digit)
    if (!/^\d{10}$/.test(mobile)) {
      return NextResponse.json({ error: "Invalid mobile" }, { status: 400 });
    }

    // ✅ Twilio Verify OTP is usually 6 digits (but keep flexible)
    if (!/^\d{4,10}$/.test(otp)) {
      return NextResponse.json({ error: "Invalid OTP input" }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID!;

    if (!accountSid || !authToken || !verifySid) {
      return NextResponse.json({ error: "Missing Twilio env" }, { status: 500 });
    }

    const client = Twilio(accountSid, authToken);

    const check = await client.verify.v2
      .services(verifySid)
      .verificationChecks.create({ to: `+91${mobile}`, code: otp });

    if (check.status !== "approved") {
      return NextResponse.json({ error: "OTP not approved" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "OTP verify failed" },
      { status: 500 }
    );
  }
}



