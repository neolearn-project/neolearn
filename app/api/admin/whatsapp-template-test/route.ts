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
    const templateName = String(body?.templateName || "").trim();
    const languageCode = String(body?.languageCode || "en").trim();
    const bodyParams = Array.isArray(body?.bodyParams) ? body.bodyParams.map(String) : [];

    if (!to || !templateName) {
      return NextResponse.json(
        { ok: false, error: "to and templateName are required." },
        { status: 400 }
      );
    }

    const components =
      bodyParams.length > 0
        ? [
            {
              type: "body",
              parameters: bodyParams.map((value: string) => ({
                type: "text",
                text: String(value ?? ""),
              })),
            },
          ]
        : [];

    const result = await sendWhatsAppTemplate({
      to,
      templateName,
      languageCode,
      components,
    });

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "WhatsApp template test failed" },
      { status: 500 }
    );
  }
}
