// app/api/cron/weekly-whatsapp/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;

const WEEKLY_REPORT_TEMPLATE =
  process.env.WA_TEMPLATE_WEEKLY_REPORT_PARENT || "neolearn_weekly_report_parent";

function safeText(value: any, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export async function GET(req: NextRequest) {
  try {
    const secret = req.headers.get("x-cron-secret");
    if (!CRON_SECRET || secret !== CRON_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: children, error: childErr } = await supabase
      .from("children")
      .select("parent_mobile, child_mobile, child_name");

    if (childErr) {
      console.error("weekly whatsapp children read error:", childErr);
      return NextResponse.json(
        { ok: false, error: "DB error reading children" },
        { status: 500 }
      );
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of children || []) {
      const parentMobile = safeText(row.parent_mobile, "");
      const childMobile = safeText(row.child_mobile, "");
      const childName = safeText(row.child_name, "Your child");

      if (!parentMobile || !childMobile) {
        skipped++;
        continue;
      }

      const weeklyRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/progress/weekly-get?mobile=${encodeURIComponent(childMobile)}`,
        { cache: "no-store" }
      );

      if (!weeklyRes.ok) {
        skipped++;
        continue;
      }

      const weeklyData = await weeklyRes.json();
      if (!weeklyData?.ok || !weeklyData.weeks?.length) {
        skipped++;
        continue;
      }

      const w = weeklyData.weeks[0];

      const topicsCompleted = safeText(w.topicsCompleted, "0");
      const testsTaken = safeText(w.testsTaken, "0");
      const avgScore =
        w.avgScore === null || w.avgScore === undefined
          ? "N/A"
          : `${w.avgScore}%`;

      try {
        await sendWhatsAppTemplate({
          to: parentMobile,
          templateName: WEEKLY_REPORT_TEMPLATE,
          languageCode: "en",
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: "Parent" },
                { type: "text", text: childName },
                { type: "text", text: topicsCompleted },
                { type: "text", text: testsTaken },
                { type: "text", text: avgScore },
              ],
            },
          ],
        });

        sent++;
      } catch (err) {
        failed++;
        console.error("weekly whatsapp template send failed:", {
          parentMobile,
          childMobile,
          childName,
          err,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      template: WEEKLY_REPORT_TEMPLATE,
      total: children?.length || 0,
      sent,
      skipped,
      failed,
    });
  } catch (err) {
    console.error("weekly-whatsapp cron error:", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}
