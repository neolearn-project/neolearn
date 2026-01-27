import { NextResponse } from "next/server";

export async function GET() {
  const hasOpenAI = !!(process.env.OPENAI_API_KEY || process.env.NEOLEARN_OPENAI_API_KEY);
  const hasSupabaseAdmin = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  return NextResponse.json({
    ok: true,
    phases: {
      openai: hasOpenAI,
      supabaseAdmin: hasSupabaseAdmin,
      personaEngine: true,
      syllabus: true,
      memorySearch: hasSupabaseAdmin, // needs db/rpc
      memorySave: hasSupabaseAdmin,   // needs db table
      tts: hasOpenAI,                 // same key
    },
  });
}
