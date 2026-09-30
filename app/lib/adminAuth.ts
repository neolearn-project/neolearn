import { NextRequest, NextResponse } from "next/server";

export function requireAdmin(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const supplied = request.headers.get("x-admin-password") || "";
  if (!expected || supplied !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
