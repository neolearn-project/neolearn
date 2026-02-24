export const dynamic = "force-dynamic";

// app/api/cron/weekly-whatsapp/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsAppText } from "@/lib/whatsapp";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;

export async function GET(req: NextRequest) {
  try {
    // ðŸ” Security check
    const secret = req.headers.get("x-cron-secret");
    if (!CRON_SECRET || secret !== CRON_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1ï¸âƒ£ Read parentâ€“child links
    const { data: children, error: childErr } = await supabase
      .from("children")
      .select("parent_mobile, child_mobile, child_name");

    if (childErr) {
      console.error("cron children read error:", childErr);
      return NextResponse.json(
        { ok: false, error: "DB error reading children" },
        { status: 500 }
      );
    }

    // 2ï¸âƒ£ Send weekly report for each child
    for (const row of children || []) {
      const parentMobile = row.parent_mobile;
      const childMobile = row.child_mobile;
      const childName = row.child_name ?? "Your child";

      // Get weekly progress
      const weeklyRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/progress/weekly-get?mobile=${childMobile}`,
        { cache: "no-store" }
      );

      if (!weeklyRes.ok) continue;

      const weeklyData = await weeklyRes.json();
      if (!weeklyData?.ok || !weeklyData.weeks?.length) continue;

      const w = weeklyData.weeks[0];

      const msg =
`ðŸ“˜ *NeoLearn Weekly Report*

ðŸ‘¦ Student: *${childName}*
ðŸ“… Week: ${w.weekStart} â†’ ${w.weekEnd}

âœ… Topics completed: ${w.topicsCompleted}
ðŸ“ Tests taken: ${w.testsTaken}
ðŸ“Š Average score: ${w.avgScore ?? "N/A"}%

Keep supporting ${childName}'s learning journey! ðŸŒ±
â€” NeoLearn`;

      await sendWhatsAppText(parentMobile, msg);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("weekly-whatsapp cron error:", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}

