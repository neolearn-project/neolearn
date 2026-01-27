import { NextResponse } from "next/server";
import twilio from "twilio";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

function usernameToEmail(username: string) {
  return `${username.toLowerCase()}@neolearn.in`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const otpToken = String(body?.otpToken || "").trim(); // phone in E.164
    const otp = String(body?.otp || "").trim();

    const name = String(body?.name || "").trim();
    const mobile = String(body?.mobile || "").trim();
    const classId = String(body?.classId || "6").trim();
    const board = String(body?.board || "cbse").trim();

    const username = String(body?.username || "").trim().toLowerCase();
    const password = String(body?.password || "").trim();

    if (!otpToken || !otp || !name || !mobile || !username || !password) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // 1) Verify OTP via Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID!;
    const client = twilio(accountSid, authToken);

    const check = await client.verify.v2
      .services(verifySid)
      .verificationChecks.create({ to: otpToken, code: otp });

    if (check.status !== "approved") {
      return NextResponse.json({ error: "Invalid OTP." }, { status: 401 });
    }

    // 2) Create Supabase Auth user (service role)
    const email = usernameToEmail(username);

    const supabase = supabaseAdmin();

const created = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // no need to email confirm (we already verified phone)
      user_metadata: {
        role: "student",
        username,
        name,
        mobile,
        classId,
        board,
      },
    });

    if (created.error || !created.data?.user) {
      const msg = created.error?.message || "Failed to create user";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const user = created.data.user;

    // 3) Save student profile in DB
    // Recommended: use student_profile table for app profile fields
    // If your columns differ, tell me and I will adjust to your exact schema.
    
const up = await supabase.from("student_profile").upsert(
  {
    user_id: user.id,
    username,
        full_name: name,
        mobile,
        class_id: classId,
        board,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (up.error) {
      console.error("student_profile upsert error:", up.error);
      // user created but profile not saved
      return NextResponse.json(
        { error: "User created but profile save failed. Check student_profile columns." },
        { status: 500 }
      );
    }

    // 4) Return OK
    return NextResponse.json(
      {
        ok: true,
        userId: user.id,
        student: { userId: user.id, username, name, classId, board, mobile },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("student-signup-verify error:", err);
    return NextResponse.json({ error: "Signup verification failed." }, { status: 500 });
  }
}
