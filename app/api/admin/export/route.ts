// app/api/admin/export/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvEscape(s: any) {
  const t = (s ?? "").toString();
  return `"${t.replace(/"/g, '""')}"`;
}

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("created_at,name,klass,phone,source")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const header = ["created_at", "name", "class", "phone", "source"].join(",");
  const rows = (data ?? []).map(r =>
    [r.created_at, r.name, r.klass, r.phone, r.source].map(csvEscape).join(",")
  );
  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${Date.now()}.csv"`,
    },
  });
}
