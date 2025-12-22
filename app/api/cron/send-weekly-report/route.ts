// app/api/cron/send-weekly-report/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const WHATSAPP_WEBHOOK_URL = process.env.WHATSAPP_WEBHOOK_URL || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

export async function GET(req: NextRequest) {
  try {
    // Optional: simple protection for cron
    if (CRON_SECRET) {
      const { searchParams } = new URL(req.url);
      const token = searchParams.get("token");
      if (token !== CRON_SECRET) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized cron call." },
          { status: 401 }
        );
      }
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase server env vars are missing." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate last week range (Mon-Sun)
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const diffThisWeekMon = now.getDate() - day + (day === 0 ? -6 : 1);
    const thisWeekMonday = new Date(now);
    thisWeekMonday.setDate(diffThisWeekMon);
    thisWeekMonday.setHours(0, 0, 0, 0);

    const lastWeekMonday = new Date(thisWeekMonday);
    lastWeekMonday.setDate(lastWeekMonday.getDate() - 7);

    const lastWeekSunday = new Date(lastWeekMonday);
    lastWeekSunday.setDate(lastWeekSunday.getDate() + 6);
    lastWeekSunday.setHours(23, 59, 59, 999);

    const fromIso = lastWeekMonday.toISOString();
    const toIso = lastWeekSunday.toISOString();

    const { data, error } = await supabase
      .from("topic_progress")
      .select(
        `
        id,
        student_mobile,
        student_name,
        board,
        class_number,
        subject_id,
        chapter_id,
        topic_id,
        status,
        score,
        created_at
      `
      )
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("cron send-weekly-report supabase error:", error);
      return NextResponse.json(
        { ok: false, error: "DB error while reading topic_progress." },
        { status: 500 }
      );
    }

    // Group by student_mobile
    type StudentSummary = {
      studentName: string;
      mobile: string;
      topicsCompleted: number;
      testsTaken: number;
      scoreSum: number;
      scoreCount: number;
    };

    const byStudent: Record<string, StudentSummary> = {};

    for (const row of data || []) {
      const mobile = row.student_mobile as string;
      if (!mobile) continue;

      if (!byStudent[mobile]) {
        byStudent[mobile] = {
          studentName: row.student_name || "Student",
          mobile,
          topicsCompleted: 0,
          testsTaken: 0,
          scoreSum: 0,
          scoreCount: 0,
        };
      }

      if (row.status === "completed") {
        byStudent[mobile].topicsCompleted += 1;
      }

      if (row.score !== null && typeof row.score === "number") {
        byStudent[mobile].testsTaken += 1;
        byStudent[mobile].scoreSum += row.score;
        byStudent[mobile].scoreCount += 1;
      }
    }

    const weekLabel = `${lastWeekMonday
      .toISOString()
      .substring(0, 10)} to ${lastWeekSunday
      .toISOString()
      .substring(0, 10)}`;

    const messages: { to: string; text: string }[] = [];

    for (const mobile of Object.keys(byStudent)) {
      const s = byStudent[mobile];
      const avgScore =
        s.scoreCount > 0
          ? Math.round(s.scoreSum / s.scoreCount)
          : null;

      const textLines = [
        `NeoLearn Weekly Report (${weekLabel})`,
        ``,
        `Dear Parent,`,
        `This is the progress report for ${s.studentName}:`,
        ``,
        `• Topics completed: ${s.topicsCompleted}`,
        `• Tests taken: ${s.testsTaken}`,
        avgScore !== null ? `• Average score: ${avgScore}%` : `• Average score: N/A`,
        ``,
        `We will keep helping your child learn step by step.`,
        `– NeoLearn AI Teacher`,
      ];

      messages.push({
        to: mobile,
        text: textLines.join("\n"),
      });
    }

    // OPTIONAL: send to your WhatsApp provider webhook
    if (WHATSAPP_WEBHOOK_URL && messages.length > 0) {
      try {
        await fetch(WHATSAPP_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        });
      } catch (err) {
        console.error("Failed to call WhatsApp webhook:", err);
      }
    } else {
      console.log(
        "Weekly WhatsApp preview (no WHATSAPP_WEBHOOK_URL set):",
        messages
      );
    }

    return NextResponse.json({
      ok: true,
      week: weekLabel,
      totalStudents: Object.keys(byStudent).length,
      messagesPreview: messages.slice(0, 5),
    });
  } catch (err) {
    console.error("send-weekly-report cron error:", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected cron server error." },
      { status: 500 }
    );
  }
}
