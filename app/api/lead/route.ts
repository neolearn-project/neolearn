import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabaseClient";

function normalizePhone(v:string){
  const d = (v||"").replace(/\D/g,"");
  if(d.length===10) return "91"+d;     // default to India code if 10-digit
  return d;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.student_name || !body?.student_class || !body?.parent_phone) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }
    const phone = normalizePhone(body.parent_phone);
    const supa = supabaseServerAdmin();

    // 1) Duplicate check
    const { data:existing, error:selErr } = await supa
      .from("leads").select("id").eq("parent_phone", phone).limit(1);
    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

    // WhatsApp deeplink
    const msg = `Hi! This is NeoLearn. Thanks for requesting a free demo for ${body.student_name} (${body.student_class}). We will confirm your schedule soon.`;
    const whatsapp = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

    if (existing && existing.length>0){
      // 2) Already have this lead — be friendly, still return WhatsApp link
      return NextResponse.json({ ok:true, duplicate:true, whatsapp });
    }

    // 3) Insert new
    const { error:insErr } = await supa.from("leads").insert([{
      student_name: body.student_name,
      student_class: body.student_class,
      parent_phone: phone,
      source: body.source || "form",
    }]);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, duplicate:false, whatsapp });
  } catch (e:any) {
    return NextResponse.json({ error: e.message || "bad request" }, { status: 400 });
  }
}
