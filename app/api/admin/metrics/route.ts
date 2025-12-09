// app/api/admin/metrics/route.ts
// Temporary stub to avoid build-time Supabase errors.
// We will re-implement proper metrics later.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Admin metrics API is temporarily disabled while we upgrade the admin APIs.",
    },
    { status: 501 }
  );
}
