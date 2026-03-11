"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Track = "regular" | "competitive";

export default function SignupForm({
  onDone,
  onSwitchToLogin,
}: {
  onDone: () => void;
  onSwitchToLogin?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    studentName: "",
    studentMobile: "",
    parentName: "",
    parentMobile: "",
    board: "CBSE",
    classNumber: "6",
    country: "India",
    language: "English",
    track: "regular" as Track,
  });

  async function createAccount() {
    setMsg(null);

    if (!form.studentName.trim()) return setMsg("Enter student name.");
    if (!/^\d{10}$/.test(form.studentMobile.trim())) return setMsg("Enter valid student mobile (10 digits).");
    if (!form.parentName.trim()) return setMsg("Enter parent name.");
    if (!/^\d{10}$/.test(form.parentMobile.trim())) return setMsg("Enter valid parent WhatsApp mobile (10 digits).");

    setLoading(true);
    try {
      const res = await fetch("/api/parent/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentMobile: form.parentMobile.trim(),
          parentName: form.parentName.trim(),

          childName: form.studentName.trim(),
          childMobile: form.studentMobile.trim(),

          board: form.board,
          classNumber: Number(form.classNumber || "6"),
          country: form.country,
          language: form.language,

          // NEW: track (preferred)
          track: form.track,

          // Backward compatibility if server still reads subjectType
          subjectType: form.track,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setMsg("Account created ✅");
      onDone();

      // You can adjust this route as per your app flow
      router.push("/parent/dashboard");
    } catch (e: any) {
      setMsg(e?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {msg && <div className="text-sm text-slate-700">{msg}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Student name"
          value={form.studentName}
          onChange={(e) => setForm((f) => ({ ...f, studentName: e.target.value }))}
        />
        <input
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Student mobile (10 digits)"
          value={form.studentMobile}
          onChange={(e) => setForm((f) => ({ ...f, studentMobile: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Parent name"
          value={form.parentName}
          onChange={(e) => setForm((f) => ({ ...f, parentName: e.target.value }))}
        />
        <input
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Parent WhatsApp mobile (10 digits)"
          value={form.parentMobile}
          onChange={(e) => setForm((f) => ({ ...f, parentMobile: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          value={form.board}
          onChange={(e) => setForm((f) => ({ ...f, board: e.target.value }))}
        >
          <option value="CBSE">CBSE</option>
          <option value="TBSE">TBSE</option>
          <option value="ICSE">ICSE</option>
        </select>

        <select
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          value={form.classNumber}
          onChange={(e) => setForm((f) => ({ ...f, classNumber: e.target.value }))}
        >
          {["5", "6", "7", "8", "9", "10", "11", "12"].map((c) => (
            <option key={c} value={c}>
              Class {c}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          value={form.country}
          onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
        >
          <option value="India">India</option>
          <option value="Bangladesh">Bangladesh</option>
          <option value="Nepal">Nepal</option>
        </select>

        <select
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          value={form.language}
          onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
        >
          <option value="English">English</option>
          <option value="Hindi">Hindi</option>
          <option value="Bengali">Bengali</option>
        </select>

        <select
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          value={form.track}
          onChange={(e) => setForm((f) => ({ ...f, track: e.target.value as Track }))}
        >
          <option value="regular">Regular (Class V–XII)</option>
          <option value="competitive">Competitive</option>
        </select>
      </div>

      <button
        type="button"
        disabled={loading}
        className="btn btn-primary w-full"
        onClick={createAccount}
      >
        {loading ? "Creating..." : "Create account"}
      </button>

      {onSwitchToLogin && (
        <div className="text-center text-sm text-slate-600">
          Already have an account?{" "}
          <button
            type="button"
            className="font-semibold text-blue-600 hover:underline"
            onClick={onSwitchToLogin}
          >
            Login
          </button>
        </div>
      )}
    </div>
  );
}