// app/api/admin/metrics/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const counts = async (table: string) => {
    const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
    return count ?? 0;
  };

  const [leads, students, batches] = await Promise.all([
    counts("leads"),
    counts("students"),
    counts("batches"),
  ]);

  // last 7 days leads
  const { data: last7 } = await supabase
    .from("leads")
    .select("created_at")
    .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());

  return NextResponse.json({
    ok: true,
    totals: { leads, students, batches },
    last7days: last7?.length ?? 0,
  });
}
