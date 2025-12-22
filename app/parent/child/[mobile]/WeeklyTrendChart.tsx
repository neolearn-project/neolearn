"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type WeekRow = {
  weekStart: string;
  weekEnd: string;
  topicsCompleted: number;
  testsTaken: number;
  avgScore: number | null;
};

function labelWeek(w: WeekRow) {
  return `${w.weekStart.slice(5)}-${w.weekEnd.slice(5)}`; // MM-DD - MM-DD
}

export default function WeeklyTrendChart({ weeks }: { weeks: WeekRow[] }) {
  const data = (weeks || []).map((w) => ({
    ...w,
    weekLabel: labelWeek(w),
    avgScoreSafe: w.avgScore ?? null,
  }));

  if (!data.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-gray-500">
        No weekly trend yet. Once your child completes topics/tests, the graph will appear here.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold mb-3">Weekly trend</div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="weekLabel" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="topicsCompleted" strokeWidth={2} dot />
            <Line type="monotone" dataKey="testsTaken" strokeWidth={2} dot />
            {/* avgScore is optional; keep it but it may be null */}
            <Line type="monotone" dataKey="avgScoreSafe" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[11px] text-gray-500">
        Lines: topics completed, tests taken, and average score (if tests exist).
      </p>
    </div>
  );
}
