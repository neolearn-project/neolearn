import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    OPENAI_API_KEY_present: !!process.env.OPENAI_API_KEY,
    NEOLEARN_OPENAI_API_KEY_present: !!process.env.NEOLEARN_OPENAI_API_KEY,
  });
}