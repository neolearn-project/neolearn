import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabaseClient";
export async function GET() {
  try {
    const supa = supabaseServerAdmin();
    const { data, error } = await supa.from("leads").select("id").limit(1);
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok:true, sampleCount: (data||[]).length });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message }, { status: 500 });
  }
}
