import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabase/server";

export async function GET() {
  const supa = supabaseServerAdmin();

  // helpers for date ranges (UTC-safe-ish)
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const last7 = new Date(now); last7.setUTCDate(now.getUTCDate() - 7);
  const last30 = new Date(now); last30.setUTCDate(now.getUTCDate() - 30);

  // counts: Supabase pattern for counts is select with head:true + count:'exact'
  const [{ count: total = 0 }, { count: today = 0 }, { count: week = 0 }, { count: month = 0 }] =
    await Promise.all([
      supa.from("leads").select("*", { count: "exact", head: true }),
      supa.from("leads").select("*", { count: "exact", head: true }).gte("created_at", startOfToday.toISOString()),
      supa.from("leads").select("*", { count: "exact", head: true }).gte("created_at", last7.toISOString()),
      supa.from("leads").select("*", { count: "exact", head: true }).gte("created_at", last30.toISOString()),
    ]);

  // recent items for spark lists (optional)
  const { data: recent = [] } = await supa
    .from("leads")
    .select("created_at,student_name,class,phone,source")
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    ok: true,
    totals: { total, today, last7: week, last30: month },
    recent,
  });
}
