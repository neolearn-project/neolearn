// app/api/realtime-session/route.ts
import { NextRequest, NextResponse } from "next/server";

const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview";

export async function GET(req: NextRequest) {
  const apiKey =
    process.env.NEOLEARN_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OpenAI API key." },
      { status: 500 }
    );
  }

  // ⚠️ Dev-only: we are sending the API key back to the browser
  // via WebSocket subprotocol (`openai-insecure-api-key.*`).
  // For production we’ll switch to ephemeral tokens or a relay.
  return NextResponse.json({
    model: OPENAI_REALTIME_MODEL,
    clientSecret: apiKey,
  });
}
