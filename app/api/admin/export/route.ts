import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabase/server";

// GET /api/admin/export  → returns CSV of leads
export async function GET() {
  const supa = supabaseServerAdmin();
  const { data, error } = await supa
    .from("leads")
    .select("created_at,student_name,class,phone,source")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Export error:", error.message);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  const rows = data ?? [];
  const header = "created_at,student_name,class,phone,source";
  const csv = [
    header,
    ...rows.map(
      (r) =>
        [
          r.created_at,
          quote(r.student_name),
          quote(r.class),
          quote(r.phone),
          quote(r.source),
        ].join(",")
    ),
  ].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-export.csv"`,
    },
  });
}

function quote(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
