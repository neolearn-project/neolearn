import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabase() {
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing.");
  if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY missing.");
  return createClient(supabaseUrl, supabaseKey);
}

function requireAdminPassword(body: any) {
  const adminPw = String(body?.adminPassword || "");
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "neolearn-admin-secret";
  if (adminPw !== ADMIN_PASSWORD) {
    throw new Error("Unauthorized");
  }
}

export async function GET() {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("feature_flags")
      .select("*")
      .order("key", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, flags: data || [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load feature flags." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    requireAdminPassword(body);

    const key = String(body?.key || "").trim();
    const enabled = Boolean(body?.enabled);

    if (!key) {
      return NextResponse.json({ ok: false, error: "Missing key." }, { status: 400 });
    }

    const supabase = getSupabase();

    const { error } = await supabase.from("feature_flags").upsert(
      {
        key,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Feature flag updated." });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to update feature flag." },
      { status: e?.message === "Unauthorized" ? 401 : 500 }
    );
  }
}