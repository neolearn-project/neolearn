import { NextResponse } from "next/server";

export async function GET() {
  const ok = {
    OPENAI_API_KEY: !!(process.env.OPENAI_API_KEY || process.env.NEOLEARN_OPENAI_API_KEY),
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  const all = Object.values(ok).every(Boolean);

  return NextResponse.json({
    ok: all,
    env: ok,
    note: all ? "Ready for Vercel deploy" : "Missing env vars. Fix and retry.",
  });
}
