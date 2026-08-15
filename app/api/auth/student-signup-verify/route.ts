import { NextResponse } from "next/server";
import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function usernameToEmail(username: string) {
  return `${username.toLowerCase()}@neolearn.in`;
}

function parentMobileToEmail(mobile: string) {
  return `parent_${mobile.replace(/\D/g, "")}@neolearn.in`;
}

function isValidIndianMobile(mobile: string) {
  return /^\d{10}$/.test(String(mobile || "").replace(/\D/g, ""));
}

function titleCase(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const otpToken = String(body?.otpToken || "").trim(); // phone in E.164
    const otp = String(body?.otp || body?.code || "").replace(/\D/g, "").trim();

    const name = String(body?.name || "").trim();
    const mobile = String(body?.mobile || "").trim();
    const classId = String(body?.classId || "6").trim();
    const board = String(body?.board || "cbse").trim();
    const parentName = String(body?.parentName || "").trim();
    const parentMobile = String(body?.parentMobile || "").trim();

    const username = String(body?.username || "").trim().toLowerCase();
    const password = String(body?.password || "").trim();

    if (!otpToken || !otp || !name || !mobile || !username || !password) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    if (parentMobile && !isValidIndianMobile(parentMobile)) {
      return NextResponse.json({ error: "Enter valid parent mobile (10 digits)." }, { status: 400 });
    }

    // 1) Verify OTP via Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

if (!accountSid || !authToken || !verifySid) {
  return NextResponse.json({ error: "Twilio config missing in env." }, { status: 500 });
}

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

    const studentRow = await supabase.from("students").insert({
      id: user.id,
      name: titleCase(name),
      full_name: name,
      class_label: `Class ${classId}`,
      class: `Class ${classId}`,
      phone: mobile,
      source: "student_signup",
      guardian_name: parentName || null,
      guardian_phone: parentMobile || null,
      user_id: user.id,
      username,
      phone_verified: true,
    });

    if (studentRow.error) {
      console.error("students insert error:", studentRow.error);
      return NextResponse.json(
        { error: "User created but student record save failed." },
        { status: 500 }
      );
    }

    let parent: { userId: string; mobile: string } | null = null;

    if (parentMobile) {
      const parentEmail = parentMobileToEmail(parentMobile);
      const existingUsers = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

      if (existingUsers.error) {
        return NextResponse.json(
          { error: `Failed to validate parent account. (${existingUsers.error.message})` },
          { status: 500 }
        );
      }

      let parentUser = (existingUsers.data?.users || []).find(
        (u) => u.email?.toLowerCase() === parentEmail.toLowerCase()
      );

      if (!parentUser) {
        const parentCreate = await supabase.auth.admin.createUser({
          email: parentEmail,
          password: crypto.randomUUID(),
          email_confirm: true,
          user_metadata: {
            role: "parent",
            name: parentName || "Parent",
            mobile: parentMobile,
          },
        });

        if (parentCreate.error || !parentCreate.data?.user) {
          return NextResponse.json(
            { error: parentCreate.error?.message || "Failed to create parent account." },
            { status: 400 }
          );
        }

        parentUser = parentCreate.data.user;
      }

      const parentProfile = await supabase.from("parent_profile").upsert(
        {
          user_id: parentUser.id,
          full_name: parentName || "Parent",
          mobile: parentMobile,
          country: "India",
          preferred_language: "English",
        },
        { onConflict: "user_id" }
      );

      if (parentProfile.error) {
        return NextResponse.json(
          { error: `Failed to update parent profile. (${parentProfile.error.message})` },
          { status: 500 }
        );
      }

      const childRow = await supabase.from("children").insert({
        parent_mobile: parentMobile,
        child_name: name,
        child_mobile: mobile,
        board,
        class_number: Number(classId || 6),
        country: "India",
        language: "English",
        subject_type: "regular",
      });

      if (childRow.error) {
        return NextResponse.json(
          { error: `Failed to link parent and child. (${childRow.error.message})` },
          { status: 500 }
        );
      }

      parent = { userId: parentUser.id, mobile: parentMobile };
    }

    // 4) Return OK
    return NextResponse.json(
      {
        ok: true,
        userId: user.id,
        student: { userId: user.id, username, name, classId, board, mobile },
        parent,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("student-signup-verify error:", err);
    return NextResponse.json({ error: err?.message || "Signup verification failed." }, { status: 500 });
  }
}





