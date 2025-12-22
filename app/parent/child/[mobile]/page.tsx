"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ChildSwitcher from "./ChildSwitcher";
import WeeklyTrendChart from "./WeeklyTrendChart";
import WeakTopics from "./WeakTopics";

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  completed: {
    label: "✅ Topic Mastered",
    cls: "bg-emerald-100 text-emerald-800",
  },
  in_progress: {
    label: "🟡 Learning",
    cls: "bg-amber-100 text-amber-800",
  },
  needs_revision: {
    label: "⚠️ Needs Revision",
    cls: "bg-red-100 text-red-800",
  },
  not_started: {
    label: "❌ Not Started",
    cls: "bg-slate-100 text-slate-700",
  },
};

type WeekRow = {
  weekStart: string;
  weekEnd: string;
  topicsCompleted: number;
  testsTaken: number;
  avgScore: number | null;
};

type WeakTopic = {
  topic: string;
  attempts: number;
  score: number | null;
  updatedAt: string | null;
};

export default function ParentChildWeeklyReportPage() {
  const router = useRouter();
  const params = useParams();
  const mobile = String(params.mobile || "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [latestWeek, setLatestWeek] = useState<WeekRow | null>(null);
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);

  useEffect(() => {
    if (!mobile) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/parent/weekly-report?childMobile=${encodeURIComponent(mobile)}`, {
          cache: "no-store",
        });
        const data = await res.json();

        if (!res.ok || !data?.ok) {
          setError(data?.error || "Failed to load weekly report");
          setWeeks([]);
          setLatestWeek(null);
          setWeakTopics([]);
          return;
        }

        setWeeks(data.weeks || []);
        setLatestWeek(data.latestWeek || null);
        setWeakTopics(data.weakTopics || []);
      } catch (e: any) {
        setError(e?.message || "Failed to load weekly report");
      } finally {
        setLoading(false);
      }
    })();
  }, [mobile]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center">
            <img src="/logo/neolearn-logo.png" alt="NeoLearn" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="text-sm font-semibold">NeoLearn Parent</div>
            <div className="text-[11px] text-gray-500">Weekly report</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ChildSwitcher currentMobile={mobile} />
          <button
            onClick={() => router.push("/parent/dashboard")}
            className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold hover:bg-slate-100"
          >
            ← Back to dashboard
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-4">
        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-gray-500">
            Loading weekly report…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-200 bg-white p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Summary card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-[11px] text-gray-500">
                Latest week:{" "}
                {latestWeek ? `${latestWeek.weekStart} — ${latestWeek.weekEnd}` : "—"}
              </div>

              <div className="mt-2 text-3xl font-semibold">
                Topics completed: <span className="text-blue-600">{latestWeek?.topicsCompleted ?? 0}</span>
              </div>

              <div className="mt-2 text-sm text-gray-700">
                Tests taken: <b>{latestWeek?.testsTaken ?? 0}</b> • Average score:{" "}
                <b>{latestWeek?.avgScore == null ? "—" : `${Math.round(latestWeek.avgScore)}%`}</b>
              </div>
            </div>

            {/* Graph */}
            <WeeklyTrendChart weeks={weeks} />

            {/* Weak Topics */}
            <WeakTopics items={weakTopics} />
          </>
        )}
      </main>
    </div>
  );
}
