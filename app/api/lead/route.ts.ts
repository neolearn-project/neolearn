import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ✅ Initialize Supabase (Service Role)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

// ✅ WhatsApp message sender
async function sendWhatsApp(to: string, text: string) {
  try {
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
      console.error("❌ WhatsApp send error:", err);
    } else {
      console.log("✅ WhatsApp message sent to", to);
    }
  } catch (err) {
    console.error("⚠️ WA send exception:", err);
  }
}

export async function POST(req: Request) {
  try {
    const { student_name, klass, parent_phone, source = "website" } = await req.json();

    if (!student_name || !klass || !parent_phone) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // ✅ Insert new lead in Supabase
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
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
    }

    // ✅ Send WhatsApp confirmation (delay 1s)
    setTimeout(() => {
      const message = `👋 Hi! Thanks for requesting a free demo with *NeoLearn* for *${student_name}* (Class ${klass}).

We’ll confirm your demo slot shortly here on WhatsApp.

📚 Learn more or manage your demo here:
https://neolearn-ai.vercel.app/demo

— Team NeoLearn 💙`;
      sendWhatsApp(parent_phone, message).catch(() => {});
    }, 1000);

    return NextResponse.json({ ok: true, lead: data });
  } catch (e) {
    console.error("Lead route exception:", e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
