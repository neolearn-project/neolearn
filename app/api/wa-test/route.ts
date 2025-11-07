// app/api/wa-test/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'edge';           // or 'nodejs' is also fine
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { to, text } = await req.json();
    if (!to || !text) {
      return NextResponse.json({ ok: false, error: 'Missing "to" or "text"' }, { status: 400 });
    }

    const waRes = await fetch(
      `https://graph.facebook.com/v20.0/${process.env.WA_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      }
    );

    const data = await waRes.json();
    if (!waRes.ok) {
      return NextResponse.json({ ok: false, error: data }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'wa-test' });
}
