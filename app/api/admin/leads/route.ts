import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

export async function GET(req: Request) {
  const url = new URL(req.url);

  // accept both ?pw= and ?auth= for safety
  const pw =
    url.searchParams.get("pw") ||
    url.searchParams.get("auth") ||
    "";

  const expected = process.env.ADMIN_PASSWORD || "";

  if (!expected || pw !== expected) {
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
