"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const PARENT_STORAGE_KEY = "neolearnParentMobile";

interface ChildRow {
  id: number;
  parent_mobile: string;
  child_name: string;
  child_mobile: string;
  board: string;
  class_number: number;
  created_at: string;
}

export default function ParentDashboardPage() {
  const router = useRouter();
  const [parentMobile, setParentMobile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [form, setForm] = useState({
    childName: "",
    childMobile: "",
    board: "CBSE",
    classNumber: "6",
  });
  const [saving, setSaving] = useState(false);

  // Load parent mobile from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(PARENT_STORAGE_KEY);
    if (!stored) {
      router.replace("/parent/login");
      return;
    }
    setParentMobile(stored);
  }, [router]);

  // Load children for this parent
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

        setChildren(data.children || []);
      } catch (err: any) {
        console.error("loadChildren error:", err);
        setStatus(err?.message || "Failed to load children.");
      } finally {
        setLoading(false);
      }
    };

    loadChildren();
  }, [parentMobile]);

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

      setStatus(
        data.mode === "updated"
          ? "Child profile updated."
          : "Child added successfully."
      );

      const incoming: ChildRow = data.child;
      setChildren((prev) => {
        const idx = prev.findIndex((c) => c.id === incoming.id);
        if (idx === -1) return [...prev, incoming];
        const copy = [...prev];
        copy[idx] = incoming;
        return copy;
      });

      setForm({
        childName: "",
        childMobile: "",
        board: "CBSE",
        classNumber: "6",
      });
    } catch (err: any) {
      console.error("add child error:", err);
      setStatus(err?.message || "Failed to save child profile.");
    } finally {
      setSaving(false);
    }
  };

  if (!parentMobile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Redirecting to parent login…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center">
            <img
              src="/logo/neolearn-logo.png"
              alt="NeoLearn logo"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <div className="text-sm font-semibold">NeoLearn Parent</div>
            <div className="text-[11px] text-gray-500">
              Track your children&apos;s learning progress
            </div>
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

      {/* Main layout */}
      <main className="mx-auto max-w-5xl px-4 py-4 flex gap-4">
        {/* Children list */}
        <section className="flex-1 rounded-2xl bg-white p-4 shadow-sm text-sm">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-base font-semibold">Your Children</h1>
            <span className="text-[11px] text-gray-500">
              Each child has their own NeoLearn classroom.
            </span>
          </div>

          {loading && (
            <p className="text-xs text-gray-500">
              Loading child profiles from server…
            </p>
          )}

          {status && !loading && (
            <p className="text-[11px] text-gray-600 mb-2">{status}</p>
          )}

          {!loading && children.length === 0 && (
            <p className="text-xs text-gray-500">
              No children added yet. Use the form on the right to add your
              first child.
            </p>
          )}

          {children.length > 0 && (
            <div className="mt-2 space-y-2">
              {children.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold">
                      {c.child_name}
                    </div>
                    <div className="text-[11px] text-gray-600">
                      Class {c.class_number} • {c.board} • Mobile:{" "}
                      <span className="font-mono">{c.child_mobile}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      Weekly progress and topic test reports will appear here
                      soon, based on this child&apos;s NeoLearn activity.
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-gray-500">
                    <div>
                      Created:{" "}
                      {new Date(c.created_at).toLocaleDateString()}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/parent/child/${c.child_mobile}`)
                      }
                      className="mt-1 rounded-full border border-blue-500 px-3 py-1 text-[11px] font-semibold text-blue-600 bg-white hover:bg-blue-50"
                    >
                      View weekly report
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Add / Edit child form */}
        <section className="w-80 rounded-2xl bg-white p-4 shadow-sm text-sm">
          <h2 className="text-base font-semibold mb-2">Add / Edit Child</h2>
          <p className="text-[11px] text-gray-500 mb-3">
            Use the same mobile number that your child uses to log in to the
            NeoLearn student app. This connects their progress to your
            dashboard.
          </p>

          <form onSubmit={handleAddChild} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">
                Child name
              </label>
              <input
                type="text"
                value={form.childName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, childName: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Riya Saha"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">
                Child mobile (student login)
              </label>
              <input
                type="tel"
                value={form.childMobile}
                onChange={(e) =>
                  setForm((f) => ({ ...f, childMobile: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="10-digit mobile"
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  Board
                </label>
                <select
                  value={form.board}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, board: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="CBSE">CBSE</option>
                  <option value="TBSE">TBSE</option>
                  <option value="ICSE">ICSE</option>
                </select>
              </div>
              <div className="w-24">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  Class
                </label>
                <select
                  value={form.classNumber}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      classNumber: e.target.value,
                    }))
                  }
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

            <p className="text-[10px] text-gray-400 mt-1">
              Later we will show plan status (Active / Expired) and allow
              online payments per child.
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}
