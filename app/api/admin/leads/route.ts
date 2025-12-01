import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is required (admin/leads route).");
}
if (!supabaseKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE (or SUPABASE_SERVICE_ROLE_KEY) is required (admin/leads route)."
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  const url = new URL(req.url);

  // accept both ?pw= and ?auth= for safety
  const pw =
    url.searchParams.get("pw") ||
    url.searchParams.get("auth") ||
    "";

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "neolearn-admin-secret";

  if (pw !== ADMIN_PASSWORD) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, leads: data });
}
