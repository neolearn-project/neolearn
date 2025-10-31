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

// GET /api/admin/batches?auth=ADMIN_PASSWORD
export async function GET(req: Request) {
  const unauthorized = assertAdmin(req);
  if (unauthorized) return unauthorized;

  const supa = supabaseServerAdmin();
  const { data, error } = await supa
    .from("batches")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/admin/batches?auth=ADMIN_PASSWORD
// body: { title, subject, class_label, schedule?, capacity? }
export async function POST(req: Request) {
  const unauthorized = assertAdmin(req);
  if (unauthorized) return unauthorized;

  const body = await req.json();
  const payload = {
    title: String(body.title || "").trim(),
    subject: String(body.subject || "").trim(),
    class_label: String(body.class_label || "").trim(),
    schedule: String(body.schedule || "").trim() || null,
    capacity: Number(body.capacity || 30),
  };
  if (!payload.title || !payload.subject || !payload.class_label) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supa = supabaseServerAdmin();
  const { data, error } = await supa.from("batches").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
