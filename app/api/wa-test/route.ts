// app/api/wa-test/route.ts
export const dynamic = "force-dynamic"; // ensure this is not statically cached

import { NextResponse } from "next/server";

export async function GET() {
  // If you can see this JSON in the browser at /api/wa-test, the route is deployed.
  return NextResponse.json({
    ok: true,
    ready: true,
    expect: "POST with { to, text }",
    envs: {
      has_WA_PHONE_NUMBER_ID: !!process.env.WA_PHONE_NUMBER_ID,
      has_WA_ACCESS_TOKEN: !!process.env.WA_ACCESS_TOKEN,
    },
  });
}

export async function POST(req: Request) {
  try {
    const { to, text } = await req.json();

    const phoneId = process.env.WA_PHONE_NUMBER_ID;
    const token = process.env.WA_ACCESS_TOKEN;

    if (!phoneId || !token) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing WA envs",
          have_phoneId: !!phoneId,
          have_token: !!token,
        },
        { status: 500 }
      );
    }

    const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to, // e.g., "916009801220"
        type: "text",
        text: { body: text || "NeoLearn WA test ✅" },
      }),
    });

    const body = await res.text(); // return exact response from Meta for debugging
    return NextResponse.json({ ok: res.ok, status: res.status, body });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
