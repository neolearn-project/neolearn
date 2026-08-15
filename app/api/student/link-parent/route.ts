import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  OwnershipError,
  ownershipErrorResponse,
  requireStudentMobile,
} from "@/lib/auth/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const studentMobile = String(body?.studentMobile || body?.mobile || "").trim();
    const parentMobile = String(body?.parentMobile || "").trim();
    const parentName = String(body?.parentName || "Parent").trim() || "Parent";

    if (!isValidIndianMobile(studentMobile)) {
      return NextResponse.json({ ok: false, error: "Invalid student mobile." }, { status: 400 });
    }

    if (!isValidIndianMobile(parentMobile)) {
      return NextResponse.json({ ok: false, error: "Enter valid parent mobile (10 digits)." }, { status: 400 });
    }

    const identity = await requireStudentMobile(req, studentMobile);
    const admin = identity.admin || supabaseAdmin();

    const { data: student, error: studentError } = await admin
      .from("students")
      .select("id, user_id, name, full_name, phone, class_label, class, username")
      .eq("phone", studentMobile)
      .limit(1)
      .maybeSingle();

    if (studentError) {
      return NextResponse.json({ ok: false, error: "Failed to load student record." }, { status: 500 });
    }

    if (!student) {
      return NextResponse.json({ ok: false, error: "Student record not found." }, { status: 404 });
    }

    const { data: profile } = await admin
      .from("student_profile")
      .select("*")
      .eq("mobile", studentMobile)
      .limit(1)
      .maybeSingle();

    const parentEmail = parentMobileToEmail(parentMobile);
    const authUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (authUsers.error) {
      return NextResponse.json(
        { ok: false, error: `Failed to validate parent account. (${authUsers.error.message})` },
        { status: 500 }
      );
    }

    let parentUser = (authUsers.data?.users || []).find(
      (user) => user.email?.toLowerCase() === parentEmail.toLowerCase()
    );

    if (!parentUser) {
      const created = await admin.auth.admin.createUser({
        email: parentEmail,
        password: crypto.randomUUID(),
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

    const parentProfile = await admin.from("parent_profile").upsert(
      {
        user_id: parentUser.id,
        full_name: parentName,
        mobile: parentMobile,
        country: "India",
        preferred_language: "English",
      },
      { onConflict: "user_id" }
    );

    if (parentProfile.error) {
      return NextResponse.json(
        { ok: false, error: `Failed to update parent profile. (${parentProfile.error.message})` },
        { status: 500 }
      );
    }

    const studentName = student.full_name || student.name || "Student";
    const classNumber = Number(String(student.class_label || student.class || "6").replace(/\D/g, "") || 6);
    const profileTrack = String(profile?.track || profile?.subject_type || "").toLowerCase();
    const isCompetitive =
      profileTrack === "competitive" ||
      /\b(jee|neet|cuet|ssc|banking|upsc|foundation)\b/i.test(
        `${profile?.board || ""} ${student.class_label || ""} ${student.class || ""}`
      );
    const boardOrExam =
      profile?.board ||
      (isCompetitive ? String(student.class_label || student.class || "Foundation").replace(/^Class\s+/i, "") : "CBSE");

    const studentUpdate = await admin
      .from("students")
      .update({
        guardian_name: parentName,
        guardian_phone: parentMobile,
      })
      .eq("phone", studentMobile);

    if (studentUpdate.error) {
      return NextResponse.json(
        { ok: false, error: `Failed to link student guardian. (${studentUpdate.error.message})` },
        { status: 500 }
      );
    }

    const { data: existingChild, error: existingChildError } = await admin
      .from("children")
      .select("id")
      .eq("parent_mobile", parentMobile)
      .eq("child_mobile", studentMobile)
      .limit(1)
      .maybeSingle();

    if (existingChildError) {
      return NextResponse.json(
        { ok: false, error: `Failed to validate child link. (${existingChildError.message})` },
        { status: 500 }
      );
    }

    const childPayload = {
      child_name: titleCase(studentName),
      board: boardOrExam,
      class_number: isCompetitive ? null : Number.isFinite(classNumber) ? classNumber : 6,
      country: "India",
      language: "English",
      subject_type: isCompetitive ? "competitive" : "regular",
    };

    const childWrite = existingChild
      ? await admin.from("children").update(childPayload).eq("id", existingChild.id)
      : await admin.from("children").insert({
          parent_mobile: parentMobile,
          child_mobile: studentMobile,
          ...childPayload,
        });

    if (childWrite.error) {
      return NextResponse.json(
        { ok: false, error: `Failed to save child link. (${childWrite.error.message})` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      parent: { userId: parentUser.id, mobile: parentMobile },
      linked: true,
    });
  } catch (err) {
    if (err instanceof OwnershipError) return ownershipErrorResponse(err);
    console.error("student link-parent route error:", err);
    return NextResponse.json({ ok: false, error: "Failed to link parent." }, { status: 500 });
  }
}
