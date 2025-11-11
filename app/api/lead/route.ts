import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!,
  { auth: { persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const student_name =
      body.student_name ?? body.name ?? body.student ?? null;

    const klass = body.klass ?? body.class ?? null;
    const parent_phone = String(body.parent_phone ?? body.phone ?? "")
      .replace(/\D/g, "");
    const source = body.source ?? "form";

    if (!student_name || !klass || !parent_phone) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_fields",
          got: { student_name, klass, parent_phone },
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("leads")
      .insert({
        student_name,
        class: klass,
        phone: parent_phone,
        source,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "db_insert_failed", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, lead: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "lead" });
}
