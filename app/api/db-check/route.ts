import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabaseClient";

export async function GET() {
  try {
    const supa = supabaseServerAdmin();

    const { data: sampleData, error: sampleError } = await supa
      .from("leads")
      .select("id")
      .limit(1);

    if (sampleError) {
      return NextResponse.json(
        { ok: false, error: sampleError.message },
        { status: 500 }
      );
    }

    const { data: columns, error: columnError } = await supa
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", "children");

    const columnNames = new Set((columns || []).map((c: any) => c.column_name));

    return NextResponse.json({
      ok: !columnError,
      sampleCount: (sampleData || []).length,
      childrenPreferenceColumns: {
        country: columnNames.has("country"),
        language: columnNames.has("language"),
        track: columnNames.has("track"),
        subject_type: columnNames.has("subject_type"),
      },
      columnCheckError: columnError?.message || null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
