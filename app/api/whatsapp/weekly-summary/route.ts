import { NextRequest, NextResponse } from "next/server";
import { sendWeeklySummaryWhatsApp } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parentMobile = String(body.parentMobile || "").trim();
    const summaryText = String(body.summaryText || "").trim();

    if (!parentMobile || !summaryText) {
      return NextResponse.json(
        { ok: false, error: "parentMobile and summaryText are required" },
        { status: 400 }
      );
    }

    await sendWeeklySummaryWhatsApp(parentMobile, summaryText);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("weekly-summary whatsapp error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
