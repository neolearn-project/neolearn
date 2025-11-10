import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "@/lib/whatsapp";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

export async function POST(req: Request) {
  try {
    const { student_name, klass, parent_phone, source = "website" } = await req.json();

    if (!student_name || !klass || !parent_phone) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("leads")
      .insert({
        student_name,
        class: klass,
        phone: parent_phone,
        source,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
    }

    // fire-and-forget is OK, but awaiting once helps catch auth mistakes early
    await sendWhatsApp(
      parent_phone,
      `Thanks for requesting a NeoLearn demo for ${student_name} (Class ${klass}). We'll confirm your slot shortly on WhatsApp.`
    );

    return NextResponse.json({ ok: true, lead: data });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
