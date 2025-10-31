import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabaseClient";

function assertAdmin(req: Request) {
  const url = new URL(req.url);
  const auth = url.searchParams.get("auth") || req.headers.get("x-admin-auth") || "";
  const pass = process.env.ADMIN_PASSWORD || "";
  if (!auth || auth !== pass) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// POST /api/admin/convert-lead?auth=ADMIN_PASSWORD
// body: { lead_id: string, batch_id?: string }
export async function POST(req: Request) {
  const unauthorized = assertAdmin(req);
  if (unauthorized) return unauthorized;

  const { lead_id, batch_id } = await req.json();
  if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const supa = supabaseServerAdmin();

  // 1) fetch lead
  const { data: lead, error: e1 } = await supa.from("leads").select("*").eq("id", lead_id).single();
  if (e1 || !lead) return NextResponse.json({ error: e1?.message || "Lead not found" }, { status: 404 });

  // 2) create student
  const studentPayload = {
    full_name: lead.student_name,
    class_label: lead.student_class,
    guardian_phone: lead.parent_phone,
    guardian_name: null as string | null,
  };
  const { data: student, error: e2 } = await supa.from("students").insert(studentPayload).select("*").single();
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  // 3) mark lead as converted
  const { error: e3 } = await supa
    .from("leads")
    .update({ converted_student_id: student.id })
    .eq("id", lead.id);
  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });

  // 4) optional enroll into batch
  let enrollment = null;
  if (batch_id) {
    const { data: enr, error: e4 } = await supa
      .from("enrollments")
      .insert({ student_id: student.id, batch_id })
      .select("*")
      .single();
    if (e4) return NextResponse.json({ error: e4.message }, { status: 500 });
    enrollment = enr;
  }

  return NextResponse.json({ ok: true, student, enrollment });
}
