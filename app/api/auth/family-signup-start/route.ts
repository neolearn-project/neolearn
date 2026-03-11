import { NextResponse } from "next/server";
import twilio from "twilio";

type Track = "regular" | "competitive";

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

function normalizeTrack(value: unknown): Track | null {
  const track = String(value || "").trim().toLowerCase();
  if (track === "regular" || track === "competitive") return track;
  return null;
}

function isAllowedCompetitiveExam(value: string | null) {
  const allowed = ["JEE", "NEET", "CUET", "SSC", "Banking", "UPSC", "Foundation"];
  return !!value && allowed.includes(value);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const studentName = String(body?.studentName || "").trim();
    const studentMobile = String(body?.studentMobile || "").trim();
    const studentUserId = String(body?.studentUserId || "").trim().toLowerCase();
    const studentPassword = String(body?.studentPassword || "");
    const parentName = String(body?.parentName || "").trim();
    const parentMobile = String(body?.parentMobile || "").trim();
    const parentPassword = String(body?.parentPassword || "");
    const track = normalizeTrack(body?.track);
    const board = body?.board ? String(body.board).trim() : null;
    const classNumber = body?.classNumber ? String(body.classNumber).trim() : null;
    const competitiveExam = body?.competitiveExam ? String(body.competitiveExam).trim() : null;
    const country = String(body?.country || "").trim();
    const preferredLanguage = String(body?.preferredLanguage || "").trim();

    if (
      !studentName ||
      !studentMobile ||
      !studentUserId ||
      !studentPassword ||
      !parentName ||
      !parentMobile ||
      !parentPassword ||
      !track ||
      !country ||
      !preferredLanguage
    ) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    if (!isValidIndianMobile(parentMobile)) {
      return NextResponse.json({ error: "Enter valid parent mobile (10 digits)." }, { status: 400 });
    }

    if (!isValidIndianMobile(studentMobile)) {
      return NextResponse.json({ error: "Enter valid student mobile (10 digits)." }, { status: 400 });
    }

    if (studentUserId.length < 4) {
      return NextResponse.json({ error: "Student User ID must be at least 4 characters." }, { status: 400 });
    }

    if (studentPassword.length < 6) {
      return NextResponse.json({ error: "Student password must be at least 6 characters." }, { status: 400 });
    }

    if (parentPassword.length < 6) {
      return NextResponse.json({ error: "Parent password must be at least 6 characters." }, { status: 400 });
    }

    if (track === "regular") {
      if (!board || !classNumber) {
        return NextResponse.json({ error: "Board and class are required for regular track." }, { status: 400 });
      }
      if (!/^\d+$/.test(classNumber)) {
        return NextResponse.json({ error: "Enter a valid class." }, { status: 400 });
      }
    }

    if (track === "competitive") {
      if (!competitiveExam) {
        return NextResponse.json({ error: "Competitive exam is required for competitive track." }, { status: 400 });
      }
      if (!isAllowedCompetitiveExam(competitiveExam)) {
        return NextResponse.json({ error: "Invalid competitive exam selected." }, { status: 400 });
      }
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (!accountSid || !authToken || !verifySid) {
      return NextResponse.json({ error: "Twilio config missing in env." }, { status: 500 });
    }

    const client = twilio(accountSid, authToken);
    const phone = toE164India(parentMobile);

    await client.verify.v2.services(verifySid).verifications.create({
      to: phone,
      channel: "sms",
    });

    return NextResponse.json({ ok: true, otpToken: phone }, { status: 200 });
  } catch (err: any) {
    console.error("family-signup-start error:", err);
    return NextResponse.json({ error: err?.message || "Failed to send OTP." }, { status: 500 });
  }
}