"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const PARENT_STORAGE_KEY = "neolearn_parent_mobile";

interface ChildRow {
  id: number;
  parent_mobile: string;
  child_name: string;
  child_mobile: string;
  board: string;
  class_number: number;
  track?: "regular" | "competitive" | string;
  created_at: string;
}

type MasteryItem = {
  subject: string;
  chapter: string;
  topic: string;
  mastery_level: string;
  last_practiced_at: string | null;
};

type DailyItem = {
  date: string;
  questions: number;
  minutes: number;
  correct: number;
  incorrect: number;
};

type MasteryResponse = {
  ok: boolean;
  student?: { mobile: string; name: string | null; classId: string | null };
  mastery?: MasteryItem[];
  weakTopics?: string[];
  weekly?: DailyItem[];
  daily?: DailyItem | null;
  error?: string;
};

export default function ParentDashboardPage() {
  const router = useRouter();
  const [parentMobile, setParentMobile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [activeChildMobile, setActiveChildMobile] = useState<string>("");

  const [masteryLoading, setMasteryLoading] = useState(false);
  const [masteryError, setMasteryError] = useState<string | null>(null);
  const [masteryRows, setMasteryRows] = useState<MasteryItem[]>([]);
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  const [weeklyRows, setWeeklyRows] = useState<DailyItem[]>([]);
  const [dailyRow, setDailyRow] = useState<DailyItem | null>(null);

  const [form, setForm] = useState({
    childName: "",
    childMobile: "",
    board: "CBSE",
    classNumber: "6",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(PARENT_STORAGE_KEY);
    if (!stored) {
      router.replace("/parent/login");
      return;
    }
    setParentMobile(stored);
  }, [router]);

  useEffect(() => {
    if (!parentMobile) return;

    const loadChildren = async () => {
      setLoading(true);
      setStatus(null);
      try {
        const params = new URLSearchParams({ parentMobile });
        const res = await fetch(`/api/parent/children?${params.toString()}`);
        const data = await res.json();

        if (!res.ok || !data.ok) {
          setStatus(data?.error || "Failed to load children.");
          setChildren([]);
          return;
        }

        const incoming: ChildRow[] = data.children || [];
        setChildren(incoming);
        if (incoming.length > 0 && !activeChildMobile) {
          setActiveChildMobile(incoming[0].child_mobile);
        }
      } catch (err: any) {
        console.error("loadChildren error:", err);
        setStatus(err?.message || "Failed to load children.");
      } finally {
        setLoading(false);
      }
    };

    loadChildren();
  }, [parentMobile, activeChildMobile]);

  useEffect(() => {
    if (!activeChildMobile) return;

    const loadMastery = async () => {
      setMasteryLoading(true);
      setMasteryError(null);
      try {
        const res = await fetch(
          `/api/parent/mastery?mobile=${encodeURIComponent(activeChildMobile)}`
        );
        const data: MasteryResponse = await res.json();

        if (!res.ok || !data.ok) {
          setMasteryError(data?.error || "Failed to load mastery analytics.");
          setMasteryRows([]);
          setWeakTopics([]);
          setWeeklyRows([]);
          setDailyRow(null);
          return;
        }

        setMasteryRows(Array.isArray(data.mastery) ? data.mastery : []);
        setWeakTopics(Array.isArray(data.weakTopics) ? data.weakTopics : []);
        setWeeklyRows(Array.isArray(data.weekly) ? data.weekly : []);
        setDailyRow(data.daily || null);
      } catch (err: any) {
        console.error("mastery load error:", err);
        setMasteryError(err?.message || "Failed to load mastery analytics.");
      } finally {
        setMasteryLoading(false);
      }
    };

    loadMastery();
  }, [activeChildMobile]);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PARENT_STORAGE_KEY);
    }
    router.replace("/parent/login");
  };

  const handleAddChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentMobile) return;

    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/parent/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentMobile,
          childName: form.childName,
          childMobile: form.childMobile,
          board: form.board,
          classNumber: Number(form.classNumber || "6"),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus(data?.error || "Failed to save child profile.");
        return;
      }

      setStatus(data.mode === "updated" ? "Child profile updated." : "Child added successfully.");

      const incoming: ChildRow = data.child;
      setChildren((prev) => {
        const idx = prev.findIndex((c) => c.id === incoming.id);
        if (idx === -1) return [...prev, incoming];
        const copy = [...prev];
        copy[idx] = incoming;
        return copy;
      });

      setActiveChildMobile(incoming.child_mobile);
      setForm({ childName: "", childMobile: "", board: "CBSE", classNumber: "6" });
    } catch (err: any) {
      console.error("add child error:", err);
      setStatus(err?.message || "Failed to save child profile.");
    } finally {
      setSaving(false);
    }
  };

  const activeChild = useMemo(
    () => children.find((c) => c.child_mobile === activeChildMobile) || null,
    [children, activeChildMobile]
  );

  if (!parentMobile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Redirecting to parent login…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between px-6 py-3 border-b bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center">
            <img src="/logo/neolearn-logo.png" alt="NeoLearn logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="text-sm font-semibold">NeoLearn Parent</div>
            <div className="text-[11px] text-gray-500">Track your children&apos;s learning progress</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span>Parent: {parentMobile}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold hover:bg-slate-100"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-2xl bg-white p-4 shadow-sm text-sm space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold">Your Children</h1>
            {activeChild && (
              <div className="text-xs text-gray-500">
                Showing analytics for <span className="font-semibold text-gray-700">{activeChild.child_name}</span>
              </div>
            )}
          </div>

          {loading && <p className="text-xs text-gray-500">Loading child profiles from server…</p>}
          {status && !loading && <p className="text-[11px] text-gray-600">{status}</p>}

          {children.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {children.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveChildMobile(c.child_mobile)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap ${
                    activeChildMobile === c.child_mobile
? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white border-slate-300 text-slate-700"
                  }`}
                >
                  {c.child_name} ({c.child_mobile})
                </button>
              ))}
            </div>
          )}

          {!loading && children.length === 0 && (
            <p className="text-xs text-gray-500">No children added yet. Add a child profile to see analytics.</p>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="text-xs text-gray-500">Today</div>
              <div className="mt-2 text-xs text-gray-700">
                <div>Questions: <span className="font-semibold">{dailyRow?.questions ?? 0}</span></div>
                <div>Minutes: <span className="font-semibold">{dailyRow?.minutes ?? 0}</span></div>
                <div>Correct: <span className="font-semibold text-emerald-700">{dailyRow?.correct ?? 0}</span></div>
                <div>Incorrect: <span className="font-semibold text-rose-700">{dailyRow?.incorrect ?? 0}</span></div>
              </div>
            </div>

            <div className="rounded-xl border bg-slate-50 p-3 md:col-span-1 xl:col-span-3">
              <div className="text-xs text-gray-500 mb-2">Weak topics</div>
              <div className="flex flex-wrap gap-2">
                {weakTopics.length === 0 && <span className="text-xs text-gray-500">No weak topics right now.</span>}
                {weakTopics.map((topic) => (
                  <span key={topic} className="rounded-full bg-amber-100 text-amber-900 px-2 py-1 text-[11px] font-medium">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border p-3">
              <h2 className="text-sm font-semibold mb-2">Weekly progress</h2>
              <div className="space-y-2 text-xs">
                {weeklyRows.length === 0 && <p className="text-gray-500">No weekly entries available.</p>}
                {weeklyRows.map((row) => (
                  <div key={row.date} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-2">
                    <span className="font-medium">{row.date}</span>
                    <span>Q: {row.questions}</span>
                    <span>C: {row.correct}</span>
                    <span>I: {row.incorrect}</span>
                    <span>M: {row.minutes}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-3 overflow-auto">
              <h2 className="text-sm font-semibold mb-2">Mastery table</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-1 pr-2">Topic</th>
                    <th className="py-1 pr-2">Mastery</th>
                    <th className="py-1">Last practiced</th>
                  </tr>
                </thead>
                <tbody>
                  {masteryRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-gray-500">No mastery rows available.</td>
                    </tr>
                  )}
                  {masteryRows.map((row, idx) => (
                    <tr key={`${row.topic}-${idx}`} className="border-b last:border-0">
                      <td className="py-1 pr-2">{row.topic || "—"}</td>
                      <td className="py-1 pr-2">{row.mastery_level}</td>
                      <td className="py-1">{row.last_practiced_at ? new Date(row.last_practiced_at).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {masteryLoading && <p className="text-xs text-gray-500">Loading analytics…</p>}
          {masteryError && <p className="text-xs text-rose-600">{masteryError}</p>}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm text-sm">
          <h2 className="text-base font-semibold mb-2">Add / Edit Child</h2>
          <p className="text-[11px] text-gray-500 mb-3">
            Use the same mobile number that your child uses to log in to the NeoLearn student app.
          </p>

          <form onSubmit={handleAddChild} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Child name</label>
              <input
                type="text"
                value={form.childName}
                onChange={(e) => setForm((f) => ({ ...f, childName: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Riya Saha"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Child mobile (student login)</label>
              <input
                type="tel"
                value={form.childMobile}
                onChange={(e) => setForm((f) => ({ ...f, childMobile: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="10-digit mobile"
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Board</label>
                <select
                  value={form.board}
                  onChange={(e) => setForm((f) => ({ ...f, board: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="CBSE">CBSE</option>
                  <option value="TBSE">TBSE</option>
                  <option value="ICSE">ICSE</option>
                </select>
              </div>

              <div className="w-24">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Class</label>
                <select
                  value={form.classNumber}
                  onChange={(e) => setForm((f) => ({ ...f, classNumber: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="5">5</option>
                  <option value="6">6</option>
                  <option value="7">7</option>
                  <option value="8">8</option>
                  <option value="9">9</option>
                  <option value="10">10</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-emerald-600 text-white text-sm font-semibold py-2 hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Child Profile"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}