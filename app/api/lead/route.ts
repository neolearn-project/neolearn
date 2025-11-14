import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabaseClient";
import { sendWhatsAppText, isWhatsAppConfigured } from "@/lib/whatsapp";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const student_name = String(body.student_name || "").trim();
    const klass_raw = String(body.student_class || body.klass || "").trim();
    const phone_raw = String(body.parent_phone || body.phone || "").trim();
    const source = String(body.source || "website").trim() || "website";

    if (!student_name || !klass_raw || !phone_raw) {
      return NextResponse.json(
        { error: "Missing fields" },
        { status: 400 }
      );
    }

    // normalize
    const student_class = klass_raw;
    const phone = phone_raw.replace(/\s+/g, "");

    const supa = supabaseServerAdmin();

    // 🔍 DUPLICATE CHECK – use actual DB column names: phone, class
    const { data: existing, error: dupErr } = await supa
      .from("leads")
      .select("id, created_at, student_name, class")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1);

    if (dupErr) {
      console.error("Duplicate check error:", dupErr);
    }

    const isDuplicate = !!(existing && existing.length > 0);

    // 💾 INSERT – use actual DB columns: student_name, class, phone, source
    const { data: inserted, error } = await supa
      .from("leads")
      .insert({
        student_name,
        class: student_class,
        phone,
        source,
      })
      .select()
      .single();

    if (error) {
      console.error("DB insert error:", error);
      return NextResponse.json(
        { error: "DB insert failed" },
        { status: 500 }
      );
    }

    // 📲 SALES BOT WHATSAPP MESSAGE
    if (isWhatsAppConfigured()) {
      let message: string;

      if (!isDuplicate) {
        // New lead – strong sales script
        message =
          `Hi! 👋 This is *NeoLearn*.\n\n` +
          `Thank you for requesting a FREE demo for *${student_name}* (Class ${student_class}). 🎓\n\n` +
          `Quick question: when would you prefer the demo?\n\n` +
          `1️⃣ *Today evening*\n` +
          `2️⃣ *Tomorrow evening*\n\n` +
          `Reply with *1* or *2*, and we’ll confirm your slot here on WhatsApp.`;
      } else {
        // Existing lead – gentle follow-up
        const prev = existing![0];
        message =
          `Hi again from *NeoLearn*! 😊\n\n` +
          `We already have your demo request for *${student_name || prev.student_name}* (Class ${student_class || prev.class}).\n\n` +
          `Would you like to schedule it *today evening* or *tomorrow evening*?\n` +
          `Reply with *1* for today or *2* for tomorrow.`;
      }

      try {
        await sendWhatsAppText(phone, message);
      } catch (e) {
        console.error("WA send error in /api/lead:", e);
      }
    } else {
      console.warn("WhatsApp not configured – skipping Sales Bot send");
    }

    // WhatsApp link for frontend
    const waLinkBase = process.env.NEXT_PUBLIC_WHATSAPP?.trim();
    const whatsapp =
      waLinkBase && waLinkBase.length > 5
        ? `https://wa.me/${waLinkBase}`
        : phone
        ? `https://wa.me/${phone}`
        : null;

    return NextResponse.json({
      ok: true,
      lead: inserted,
      duplicate: isDuplicate,
      whatsapp,
    });
  } catch (e) {
    console.error("Unexpected error in /api/lead:", e);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}
