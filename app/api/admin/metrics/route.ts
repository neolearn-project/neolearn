import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabase() {
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL missing.");
  }
  if (!supabaseServiceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY missing.");
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET() {
  try {
    const supabase = getSupabase();

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      leadsResult,
      studentsResult,
      batchesResult,
      leads7dResult,
    ] = await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("children").select("*", { count: "exact", head: true }),
      supabase.from("batches").select("*", { count: "exact", head: true }),
      supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo),
    ]);

    if (leadsResult.error) {
      return NextResponse.json(
        { ok: false, error: `Leads metrics failed: ${leadsResult.error.message}` },
        { status: 500 }
      );
    }

    if (studentsResult.error) {
      return NextResponse.json(
        { ok: false, error: `Students metrics failed: ${studentsResult.error.message}` },
        { status: 500 }
      );
    }

    if (batchesResult.error) {
      return NextResponse.json(
        { ok: false, error: `Batches metrics failed: ${batchesResult.error.message}` },
        { status: 500 }
      );
    }

    if (leads7dResult.error) {
      return NextResponse.json(
        { ok: false, error: `7-day leads metrics failed: ${leads7dResult.error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      totals: {
        leads: leadsResult.count || 0,
        students: studentsResult.count || 0,
        batches: batchesResult.count || 0,
      },
      last7days: leads7dResult.count || 0,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Admin metrics API failed.",
      },
      { status: 500 }
    );
  }
}