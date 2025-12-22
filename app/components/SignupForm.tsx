"use client";

import { useState } from "react";

export default function SignupForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    studentName: "",
    studentMobile: "",
    parentName: "",
    parentMobile: "",
    board: "CBSE",
    classNumber: "6",
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setMsg(null);
    if (form.studentMobile.trim().length < 10) return setMsg("Enter valid student mobile.");
    if (form.parentMobile.trim().length < 10) return setMsg("Enter valid parent mobile.");

    setLoading(true);
    try {
      // create / update linkage
      const res = await fetch("/api/parent/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentMobile: form.parentMobile.trim(),
          childName: form.studentName.trim() || "Student",
          childMobile: form.studentMobile.trim(),
          board: form.board,
          classNumber: Number(form.classNumber || "6"),
          parentName: form.parentName.trim(), // safe to ignore server if not stored yet
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMsg(data?.error || "Signup failed.");
        return;
      }

      setMsg("Signup successful ✅ Now login with OTP.");
      onDone(); // switch to login
    } catch (e: any) {
      setMsg(e?.message || "Signup failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Student name"
          value={form.studentName}
          onChange={(e) => setForm((f) => ({ ...f, studentName: e.target.value }))}
        />
        <input
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Student mobile"
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
          placeholder="Parent WhatsApp mobile"
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
          {["5","6","7","8","9","10"].map((c) => (
            <option key={c} value={c}>Class {c}</option>
          ))}
        </select>
      </div>

      {msg && <div className="text-sm text-slate-700">{msg}</div>}

      <button disabled={loading} className="btn btn-primary w-full" onClick={submit}>
        {loading ? "Creating account…" : "Create account"}
      </button>

      <div className="text-[11px] text-slate-500">
        Trial starts on first student login (so preview doesn’t waste trial).
      </div>
    </div>
  );
}
