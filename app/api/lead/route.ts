import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

async function sendWhatsApp(to: string, text: string) {
  const url = `https://graph.facebook.com/v20.0/${process.env.WA_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("WA send error:", err);
  }
}

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

    sendWhatsApp(
      parent_phone,
      `Thanks for requesting a NeoLearn demo for ${student_name} (Class ${klass}). We'll confirm your slot shortly on WhatsApp.`
    ).catch(() => {});

    return NextResponse.json({ ok: true, lead: data });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
