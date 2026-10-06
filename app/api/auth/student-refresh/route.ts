import { NextResponse } from "next/server";
import { supabaseAnon } from "@/app/lib/supabaseAnon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let refreshToken = "";
  try {
    refreshToken = String((await req.json())?.refreshToken || "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid refresh request." }, { status: 400 });
  }
  if (!refreshToken) {
    return NextResponse.json({ ok: false, error: "Missing refresh session." }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAnon().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      const providerStatus = Number((error as any)?.status || 0);
      const status = providerStatus === 400 || providerStatus === 401 || providerStatus === 403 ? 401 : 503;
      return NextResponse.json(
        { ok: false, error: status === 401 ? "Invalid or expired session." : "Unable to refresh session right now." },
        { status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json({
      ok: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to refresh session right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
