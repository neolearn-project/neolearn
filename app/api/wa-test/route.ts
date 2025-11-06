// app/api/wa-test/route.ts
import { NextResponse } from "next/server";

// Avoid static optimization
export const dynamic = "force-dynamic";
// Optional: run on Node runtime (Meta Graph API sometimes dislikes Edge)
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { to, text } = await req.json();

    if (!to || !text) {
      return NextResponse.json(
        { ok: false, error: "Missing 'to' or 'text'" },
        { status: 400 }
      );
    }

    const token = process.env.WA_ACCESS_TOKEN!;
    const phoneId = process.env.WA_PHONE_NUMBER_ID!;

    const res = await fetch(
      `https://graph.facebook.com/v20.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          text: { body: text },
        }),
      }
    );

    // Try to parse JSON even on error for easier debugging
    const data = await res.json().catch(() => null);

    return NextResponse.json(
      { ok: res.ok, status: res.status, data },
      { status: res.ok ? 200 : res.status }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
