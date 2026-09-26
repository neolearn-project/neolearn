import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createAdminAiCreditMonitorHandler } from "@/app/lib/adminAiCreditMonitoring.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function authorizeAdmin(request: Request) {
  const expected = process.env.ADMIN_PASSWORD || "";
  return expected.length > 0 && request.headers.get("x-admin-password") === expected;
}

export const GET = createAdminAiCreditMonitorHandler({ authorizeAdmin, getDatabase: supabaseAdmin }) as
  (request: NextRequest) => Promise<Response>;
