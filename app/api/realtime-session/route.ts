import { NextRequest, NextResponse } from "next/server";

const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mobile = String(searchParams.get("mobile") || "").trim();

  if (!mobile) {
    return NextResponse.json({ error: "Missing mobile." }, { status: 400 });
  }

  const entitlementRes = await fetch(
    `${req.nextUrl.origin}/api/student/entitlements?mobile=${encodeURIComponent(mobile)}`,
    { cache: "no-store" }
  );
  const ent = await entitlementRes.json();

  if (!entitlementRes.ok || !ent?.ok) {
    return NextResponse.json({ error: "Failed to verify entitlements." }, { status: 500 });
  }

  if (!ent.features?.realtimeVoice) {
    return NextResponse.json(
      { error: "Realtime voice is available only for paid or override access." },
      { status: 403 }
    );
  }

  const apiKey =
    process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OpenAI API key." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    model: OPENAI_REALTIME_MODEL,
    clientSecret: apiKey,
  });
}