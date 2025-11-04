"use client";
import { useState } from "react";

export default function DemoRequestForm() {
  const [studentName, setStudentName] = useState("");
  const [klass, setKlass] = useState("6");
  const [parentPhone, setParentPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_name: studentName.trim(),
          klass: klass.trim(),
          parent_phone: parentPhone.replace(/\s+/g, ""),
          source: "website",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed");
      setMsg("Request submitted ✅. We’ll confirm your slot on WhatsApp.");
      setStudentName(""); setParentPhone("");
    } catch (err: any) {
      setMsg(`Error: ${err.message || "Something went wrong"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium">Student Name</label>
        <input className="border rounded px-3 py-2 w-full"
          value={studentName} onChange={(e) => setStudentName(e.target.value)} required />
      </div>

      <div>
        <label className="block text-sm font-medium">Class</label>
        <select className="border rounded px-3 py-2 w-full"
          value={klass} onChange={(e) => setKlass(e.target.value)}>
          {["5","6","7","8","9","10"].map(k => <option key={k} value={k}>Class {k}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">Parent WhatsApp (with country code)</label>
        <input className="border rounded px-3 py-2 w-full"
          value={parentPhone} onChange={(e) => setParentPhone(e.target.value)}
          placeholder="91xxxxxxxxxx" required />
      </div>

      <button type="submit" disabled={loading}
        className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-60">
        {loading ? "Submitting…" : "Request Demo"}
      </button>

      {msg && <p className="text-sm pt-2">{msg}</p>}
    </form>
  );
}
