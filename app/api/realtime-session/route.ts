import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini";

export async function GET(req: NextRequest) {
  try {
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
      return NextResponse.json(
        { error: "Failed to verify entitlements." },
        { status: 500 }
      );
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

    const secretRes = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: OPENAI_REALTIME_MODEL,
          audio: {
            output: {
              voice: "alloy",
            },
          },
        },
      }),
    });

    const secretJson = await secretRes.json();

    if (!secretRes.ok) {
      console.error("OpenAI realtime client secret error:", secretJson);
      return NextResponse.json(
        {
          error: "Failed to create realtime client secret.",
          detail: secretJson?.error?.message || secretJson,
        },
        { status: 500 }
      );
    }

    const clientSecret =
      secretJson?.value ||
      secretJson?.client_secret?.value ||
      secretJson?.client_secret ||
      secretJson?.secret;

    if (!clientSecret) {
      return NextResponse.json(
        {
          error: "Realtime client secret missing in OpenAI response.",
          detail: secretJson,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      model: OPENAI_REALTIME_MODEL,
      clientSecret,
    });
  } catch (err: any) {
    console.error("realtime-session error:", err);
    return NextResponse.json(
      { error: err?.message || "Realtime session server error." },
      { status: 500 }
    );
  }
}
