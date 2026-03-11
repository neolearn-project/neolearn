import { NextResponse } from "next/server";
import twilio from "twilio";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

type Track = "regular" | "competitive";

function userIdToEmail(userId: string) {
  return `${userId.toLowerCase()}@neolearn.in`;
}

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

function normalizeTrack(value: unknown): Track | null {
  const track = String(value || "").trim().toLowerCase();
  if (track === "regular" || track === "competitive") return track;
  return null;
}

function isAllowedCompetitiveExam(value: string | null) {
  const allowed = ["JEE", "NEET", "CUET", "SSC", "Banking", "UPSC", "Foundation"];
  return !!value && allowed.includes(value);
}

function tableError(table: string, err: any) {
  const message = err?.message || "Unknown error";
  return `Failed writing ${table}. Ensure table exists with expected columns. (${message})`;
}

export async function POST(req: Request) {
  let createdParentAuthId: string | null = null;
  let createdStudentAuthId: string | null = null;

  try {
    const body = await req.json();

    const otpToken = String(body?.otpToken || "").trim();
    const otp = String(body?.otp || "").replace(/\D/g, "").trim();

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

    if (!otpToken || !otp) {
      return NextResponse.json({ error: "Missing OTP token or OTP." }, { status: 400 });
    }

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

    if (!/^\d{4,10}$/.test(otp)) {
      return NextResponse.json({ error: "Enter a valid OTP." }, { status: 400 });
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

    const normalizedBoard = track === "regular" ? board : null;
    const normalizedClassNumber = track === "regular" ? classNumber : null;
    const normalizedCompetitiveExam = track === "competitive" ? competitiveExam : null;

    const expectedPhone = toE164India(parentMobile);
    if (otpToken !== expectedPhone) {
      return NextResponse.json({ error: "OTP session mismatch. Please start signup again." }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (!accountSid || !authToken || !verifySid) {
      return NextResponse.json({ error: "Twilio config missing in env." }, { status: 500 });
    }

    const client = twilio(accountSid, authToken);
    const check = await client.verify.v2.services(verifySid).verificationChecks.create({
      to: expectedPhone,
      code: otp,
    });

    if (check.status !== "approved") {
      return NextResponse.json({ error: "Invalid OTP." }, { status: 401 });
    }

    const admin = supabaseAdmin();

    const parentEmail = parentMobileToEmail(parentMobile);
    const studentEmail = userIdToEmail(studentUserId);

    const existingAuthUsers = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (existingAuthUsers.error) {
      return NextResponse.json(
        { error: `Failed to validate existing accounts. (${existingAuthUsers.error.message})` },
        { status: 500 }
      );
    }

    const users = existingAuthUsers.data?.users || [];
    const duplicateParent = users.find((u) => u.email?.toLowerCase() === parentEmail.toLowerCase());
    const duplicateStudent = users.find((u) => u.email?.toLowerCase() === studentEmail.toLowerCase());

    if (duplicateParent) {
      return NextResponse.json(
        { error: "Parent mobile is already registered. Please login or use forgot password." },
        { status: 409 }
      );
    }

    if (duplicateStudent) {
      return NextResponse.json(
        { error: "Student User ID is already taken. Please choose another one." },
        { status: 409 }
      );
    }

    const parentCreate = await admin.auth.admin.createUser({
      email: parentEmail,
      password: parentPassword,
      email_confirm: true,
      user_metadata: {
        role: "parent",
        name: parentName,
        mobile: parentMobile,
      },
    });

    if (parentCreate.error || !parentCreate.data?.user) {
      return NextResponse.json(
        { error: parentCreate.error?.message || "Failed to create parent account." },
        { status: 400 }
      );
    }

    createdParentAuthId = parentCreate.data.user.id;

    const studentCreate = await admin.auth.admin.createUser({
      email: studentEmail,
      password: studentPassword,
      email_confirm: true,
      user_metadata: {
        role: "student",
        username: studentUserId,
        name: studentName,
        mobile: studentMobile,
        classId: normalizedClassNumber,
        board: normalizedBoard,
        track,
        competitiveExam: normalizedCompetitiveExam,
      },
    });

    if (studentCreate.error || !studentCreate.data?.user) {
      await admin.auth.admin.deleteUser(createdParentAuthId);
      createdParentAuthId = null;

      return NextResponse.json(
        { error: studentCreate.error?.message || "Failed to create student account." },
        { status: 400 }
      );
    }

    createdStudentAuthId = studentCreate.data.user.id;

    const parentUser = parentCreate.data.user;
    const studentUser = studentCreate.data.user;

    const parentProfile = await admin.from("parent_profile").upsert(
      {
        user_id: parentUser.id,
        full_name: parentName,
        mobile: parentMobile,
        country,
        preferred_language: preferredLanguage,
      },
      { onConflict: "user_id" }
    );

    if (parentProfile.error) {
      throw new Error(tableError("parent_profile", parentProfile.error));
    }

    const studentProfile = await admin.from("student_profile").upsert(
      {
        user_id: studentUser.id,
        parent_user_id: parentUser.id,
        username: studentUserId,
        full_name: studentName,
        mobile: studentMobile,
        class_id: normalizedClassNumber,
        board: normalizedBoard,
        track,
        competitive_exam: normalizedCompetitiveExam,
        country,
        preferred_language: preferredLanguage,
      },
      { onConflict: "user_id" }
    );

    if (studentProfile.error) {
      throw new Error(tableError("student_profile", studentProfile.error));
    }

    const parentChildMap = await admin.from("parent_children").upsert(
      {
        parent_user_id: parentUser.id,
        child_user_id: studentUser.id,
        parent_mobile: parentMobile,
        child_mobile: studentMobile,
        child_name: studentName,
      },
      { onConflict: "parent_user_id,child_user_id" }
    );

    if (parentChildMap.error) {
      throw new Error(tableError("parent_children", parentChildMap.error));
    }

    return NextResponse.json(
      {
        ok: true,
        parent: { userId: parentUser.id, mobile: parentMobile },
        student: { userId: studentUser.id, userIdLabel: studentUserId, mobile: studentMobile },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("family-signup-verify error:", err);

    try {
      const admin = supabaseAdmin();

      if (createdStudentAuthId) {
        await admin.auth.admin.deleteUser(createdStudentAuthId);
      }
      if (createdParentAuthId) {
        await admin.auth.admin.deleteUser(createdParentAuthId);
      }
    } catch (cleanupErr) {
      console.error("family-signup-verify cleanup error:", cleanupErr);
    }

    return NextResponse.json(
      { error: err?.message || "Family signup verification failed." },
      { status: 500 }
    );
  }
}