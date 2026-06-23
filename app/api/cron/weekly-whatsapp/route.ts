// app/api/cron/weekly-whatsapp/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

const WEEKLY_REPORT_TEMPLATE =
  process.env.WA_TEMPLATE_WEEKLY_REPORT_PARENT || "neolearn_weekly_report_parent";

function safeText(value: any, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function getAppOrigin(req: NextRequest) {
  const configured = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (configured.startsWith("http://") || configured.startsWith("https://")) {
    return configured.replace(/\/$/, "");
  }
  return req.nextUrl.origin.replace(/\/$/, "");
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

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase env missing" },
        { status: 500 }
      );
    }

    const appOrigin = getAppOrigin(req);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: children, error: childErr } = await supabase
      .from("children")
      .select("parent_mobile, child_mobile, child_name");

    if (childErr) {
      console.error("weekly whatsapp children read error:", childErr);
      return NextResponse.json(
        { ok: false, error: "DB error reading children", detail: childErr.message },
        { status: 500 }
      );
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const errors: any[] = [];

    for (const row of children || []) {
      const parentMobile = safeText(row.parent_mobile, "");
      const childMobile = safeText(row.child_mobile, "");
      const childName = safeText(row.child_name, "Your child");

      if (!parentMobile || !childMobile) {
        skipped++;
        continue;
      }

      let weeklyData: any = null;

      try {
        const weeklyUrl =
          `${appOrigin}/api/progress/weekly-get?mobile=${encodeURIComponent(childMobile)}`;

        const weeklyRes = await fetch(weeklyUrl, { cache: "no-store" });

        if (!weeklyRes.ok) {
          skipped++;
          errors.push({
            childMobile,
            stage: "weekly-get",
            status: weeklyRes.status,
          });
          continue;
        }

        weeklyData = await weeklyRes.json();
      } catch (fetchErr: any) {
        skipped++;
        errors.push({
          childMobile,
          stage: "weekly-get-fetch",
          error: fetchErr?.message || String(fetchErr),
        });
        continue;
      }

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
      } catch (err: any) {
        failed++;
        errors.push({
          parentMobile,
          childMobile,
          childName,
          stage: "whatsapp-template",
          error: err?.message || String(err),
        });
        console.error("weekly whatsapp template send failed:", err);
      }
    }

    return NextResponse.json({
      ok: true,
      template: WEEKLY_REPORT_TEMPLATE,
      appOrigin,
      total: children?.length || 0,
      sent,
      skipped,
      failed,
      errors: errors.slice(0, 5),
    });
  } catch (err: any) {
    console.error("weekly-whatsapp cron error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Server error",
        detail: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
