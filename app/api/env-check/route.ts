import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    url_ok: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    service_len: (process.env.SUPABASE_SERVICE_ROLE || "").length,
    admin_pw_len: (process.env.ADMIN_PASSWORD || "").length,
  });
}
