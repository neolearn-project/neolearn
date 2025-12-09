// app/api/admin/export/route.ts
// Temporary stub to avoid build-time Supabase errors.
// We will re-implement proper CSV export later.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Leads export is temporarily disabled while we upgrade the admin APIs.",
    },
    { status: 501 }
  );
}





