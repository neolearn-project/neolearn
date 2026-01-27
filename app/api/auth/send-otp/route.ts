import { NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(req: Request) {
  try {
    const { mobile } = await req.json();
    const m = String(mobile || "").trim();

    if (!/^\d{10}$/.test(m)) {
      return NextResponse.json({ error: "Invalid mobile (need 10 digits)" }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (!accountSid || !authToken || !verifySid) {
      return NextResponse.json(
        { error: "Missing Twilio env (SID/TOKEN/VERIFY_SERVICE_SID)" },
        { status: 500 }
      );
    }

    const client = twilio(accountSid, authToken);

    const to = `+91${m}`;

    const verification = await client.verify.v2
      .services(verifySid)
      .verifications.create({ to, channel: "sms" });

    return NextResponse.json({ ok: true, status: verification.status });
  } catch (e: any) {
    // ✅ This will expose useful Twilio error messages in your browser response
    const msg =
      e?.message ||
      e?.details ||
      e?.moreInfo ||
      e?.code ||
      "OTP send failed";

    console.error("send-otp error full:", e);

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
