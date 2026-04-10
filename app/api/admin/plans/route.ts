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
      .from("plans")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, plans: data || [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load plans." },
      { status: e?.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    requireAdminPassword(body);

    const code = String(body?.code || "").trim().toUpperCase();
    const name = String(body?.name || "").trim();
    const track = String(body?.track || "").trim().toLowerCase();
    const price = Number(body?.price);
    const validityDays = Number(body?.validityDays);
    const isActive = Boolean(body?.isActive);
    const sortOrder = Number(body?.sortOrder || 0);

    if (!code || !name) {
      return NextResponse.json({ ok: false, error: "Code and name are required." }, { status: 400 });
    }

    if (!["regular", "competitive"].includes(track)) {
      return NextResponse.json({ ok: false, error: "Track must be regular or competitive." }, { status: 400 });
    }

    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ ok: false, error: "Invalid price." }, { status: 400 });
    }

    if (!Number.isFinite(validityDays) || validityDays <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid validityDays." }, { status: 400 });
    }

    const supabase = getSupabase();

    const { error } = await supabase.from("plans").upsert(
      {
        code,
        name,
        track,
        price,
        validity_days: validityDays,
        is_active: isActive,
        sort_order: sortOrder,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "code" }
    );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Plan saved successfully." });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to save plan." },
      { status: e?.message === "Unauthorized" ? 401 : 500 }
    );
  }
}