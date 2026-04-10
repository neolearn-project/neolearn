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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mobile = String(searchParams.get("mobile") || "").trim();

    if (!mobile) {
      return NextResponse.json({ ok: false, error: "Missing mobile." }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("student_subscriptions")
      .select("*")
      .eq("student_mobile", mobile)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({
        ok: true,
        hasSubscription: false,
        subscription: null,
      });
    }

    const now = Date.now();
    const endAt = new Date(data.end_at).getTime();
    const daysLeft = Math.max(0, Math.ceil((endAt - now) / (1000 * 60 * 60 * 24)));

    return NextResponse.json({
      ok: true,
      hasSubscription: true,
      subscription: {
        ...data,
        daysLeft,
        expired: endAt < now,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load subscription status." },
      { status: 500 }
    );
  }
}