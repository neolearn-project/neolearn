import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabase() {
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing.");
  if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY missing.");
  return createClient(supabaseUrl, supabaseKey);
}

function requireAdmin(searchParams: URLSearchParams) {
  const adminPw = String(searchParams.get("adminPassword") || "").trim();
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "neolearn-admin-secret";
  if (adminPw !== ADMIN_PASSWORD) {
    throw new Error("Unauthorized");
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    requireAdmin(searchParams);

    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") || 20), 1),
      100
    );

    const mobile = String(searchParams.get("mobile") || "").trim();
    const status = String(searchParams.get("status") || "").trim();

    const supabase = getSupabase();

    let query = supabase
      .from("student_payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (mobile) {
      query = query.eq("student_mobile", mobile);
    }

    if (status) {
      query = query.eq("payment_status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      payments: data || [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load payment history." },
      { status: e?.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
