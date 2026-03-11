import { NextResponse } from "next/server";
import { supabaseAnon } from "@/app/lib/supabaseAnon";

export async function POST() {
  try {
    const supabase = supabaseAnon(); // ✅ call it
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}


