import { NextResponse } from "next/server";
import { sendWhatsAppText } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const adminPassword = req.headers.get("x-admin-password") || "";
    if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const to = String(body?.to || "").trim();
    const message =
      String(body?.message || "").trim() ||
      "Hello from NeoLearn. This is a WhatsApp Cloud API test message.";

    await sendWhatsAppText(to, message);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "WhatsApp test failed" },
      { status: 500 }
    );
  }
}
