import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export function middleware(req: NextRequest) {
  const expectedPassword = process.env.ADMIN_PASSWORD;
  const suppliedPassword = req.headers.get("x-admin-password");

  if (!expectedPassword || suppliedPassword !== expectedPassword) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/admin/:path*",
    "/api/ai-syllabus-subject",
    "/api/avatar-test",
    "/api/db-check",
    "/api/debug-openai",
    "/api/env-check",
    "/api/persona/debug",
    "/api/system/ready",
    "/api/teacher-math/health",
    "/api/wa-test",
    "/api/whatsapp/weekly-summary",
  ],
};
