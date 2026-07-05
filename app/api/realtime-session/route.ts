import { NextRequest, NextResponse } from "next/server";
import { OwnershipError, ownershipErrorResponse, requireStudentMobile } from "@/lib/auth/ownership";
import { readJsonResponse } from "@/app/lib/safeResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini";
const REALTIME_TEACHER_VOICE = "shimmer";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mobile = String(searchParams.get("mobile") || "").trim();

    if (!mobile) {
      return NextResponse.json({ error: "Missing mobile." }, { status: 400 });
    }
    await requireStudentMobile(req, mobile);

    const entitlementRes = await fetch(
      `${req.nextUrl.origin}/api/student/entitlements?mobile=${encodeURIComponent(mobile)}`,
      {
        cache: "no-store",
        headers: {
          Authorization: req.headers.get("authorization") || "",
          cookie: req.headers.get("cookie") || "",
        },
      }
    );

    const { data: ent, errorText: entitlementError } =
      await readJsonResponse<any>(entitlementRes);

    if (!entitlementRes.ok || !ent?.ok) {
      return NextResponse.json(
        {
          error:
            ent?.error ||
            entitlementError ||
            "Failed to verify entitlements.",
        },
        {
          status:
            entitlementRes.status >= 400 && entitlementRes.status < 500
              ? entitlementRes.status
              : 502,
        }
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
              voice: REALTIME_TEACHER_VOICE,
            },
          },
        },
      }),
    });

    const { data: secretJson, errorText: secretError } =
      await readJsonResponse<any>(secretRes);

    if (!secretRes.ok) {
      console.error(
        "OpenAI realtime client secret error:",
        secretJson || secretError
      );
      return NextResponse.json(
        {
          error: "Failed to create realtime client secret.",
          detail:
            secretJson?.error?.message ||
            secretError ||
            "OpenAI returned an unexpected response.",
        },
        { status: 502 }
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
    if (err instanceof OwnershipError) return ownershipErrorResponse(err);
    console.error("realtime-session error:", err);
    return NextResponse.json(
      { error: err?.message || "Realtime session server error." },
      { status: 500 }
    );
  }
}
