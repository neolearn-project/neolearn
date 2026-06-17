import { NextResponse } from "next/server";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const adminPassword = req.headers.get("x-admin-password") || "";

    if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);

    const to = String(body?.to || "").trim();
    const templateName = String(body?.templateName || "neolearn_signup_welcome").trim();
    const languageCode = String(body?.languageCode || "en").trim();

    if (!to) {
      return NextResponse.json({ ok: false, error: "Missing to number." }, { status: 400 });
    }

    const result = await sendWhatsAppTemplate({
      to,
      templateName,
      languageCode,
      components: Array.isArray(body?.components) ? body.components : undefined,
    });

    return NextResponse.json({
      ok: true,
      to,
      templateName,
      languageCode,
      result,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "WhatsApp template test failed",
      },
      { status: 500 }
    );
  }
}
