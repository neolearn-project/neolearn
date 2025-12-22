// lib/weeklySummary.ts

type WeakTopic = {
  topic?: string | null;
  last_score?: number | null;
};

export function buildWeeklyWhatsAppText(opts: {
  studentName?: string | null;
  studentClass?: string | number | null;
  board?: string | null;
  weekStart: string;
  weekEnd: string;
  topicsCompleted: number;
  testsTaken: number;
  avgScore: number | null;
  weakTopics?: WeakTopic[];
}) {
  const name = opts.studentName || "Student";
  const cls = opts.studentClass ?? "-";
  const board = opts.board || "-";

  const avgPart =
    opts.avgScore === null ? "— (no tests yet)" : `${opts.avgScore}%`;

  const weak = Array.isArray(opts.weakTopics) ? opts.weakTopics : [];
  const topWeak = weak.slice(0, 3);

  const weakBlock =
    topWeak.length === 0
      ? "No weak topics flagged ✅"
      : [
          "⚠️ Needs Revision (Top 3):",
          ...topWeak.map((w, i) => {
            const t = w.topic || "Topic";
            const s =
              typeof w.last_score === "number" ? `${w.last_score}%` : "—";
            return `${i + 1}) ${t} — last score ${s}`;
          }),
        ].join("\n");

  return [
    "NeoLearn Weekly Report 📘",
    `Student: ${name} (Class ${cls}, ${board})`,
    `Week: ${opts.weekStart} to ${opts.weekEnd}`,
    "",
    `✅ Topics completed: ${opts.topicsCompleted}`,
    `📝 Tests taken: ${opts.testsTaken}`,
    `📊 Average score: ${avgPart}`,
    "",
    weakBlock,
    "",
    "Next step (this week):",
    "• Revise weak topics and re-attempt the topic test.",
    "• Target: 60%+ on each retry.",
    "",
    "— NeoLearn",
  ].join("\n");
}
