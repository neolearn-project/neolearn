import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const FALLBACK_PLANS = [
  {
    id: 1,
    code: "REGULAR_MONTHLY",
    name: "Regular Monthly",
    track: "regular",
    price: 399,
    validity_days: 30,
    is_active: true,
    sort_order: 1,
  },
  {
    id: 2,
    code: "REGULAR_QUARTERLY",
    name: "Regular Quarterly",
    track: "regular",
    price: 1099,
    validity_days: 90,
    is_active: true,
    sort_order: 2,
  },
  {
    id: 3,
    code: "COMPETITIVE_MONTHLY",
    name: "Competitive Monthly",
    track: "competitive",
    price: 999,
    validity_days: 30,
    is_active: true,
    sort_order: 3,
  },
];

function getSupabase() {
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing.");
  if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY missing.");
  return createClient(supabaseUrl, supabaseKey);
}

function requireAdminPassword(req: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const suppliedPassword = req.headers.get("x-admin-password");
  if (!adminPassword || suppliedPassword !== adminPassword) {
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
      console.error("plans GET Supabase error:", error);
      return NextResponse.json(
        {
          ok: true,
          plans: FALLBACK_PLANS,
          fallback: true,
          warning: error.message,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        plans: Array.isArray(data) ? data : [],
        fallback: false,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (e: any) {
    console.error("plans GET fallback:", e);
    return NextResponse.json(
      {
        ok: true,
        plans: FALLBACK_PLANS,
        fallback: true,
        warning: e?.message || "Failed to load plans from database.",
      },
      { headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    requireAdminPassword(req);

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
