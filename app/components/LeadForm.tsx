"use client";
import { useState } from "react";

export default function LeadForm() {
  const [student_name, setName] = useState("");
  const [student_class, setKlass] = useState("");
  const [parent_phone, setPhone] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_name,
          student_class,
          parent_phone,
          source: "website",
        }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || "Failed");
      setMsg("Thanks! We’ll confirm on WhatsApp shortly.");
      setName(""); setKlass(""); setPhone("");
    } catch (err: any) {
      setMsg("Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        className="w-full border rounded-xl px-3 py-2"
        placeholder="Student name"
        value={student_name}
        onChange={e=>setName(e.target.value)}
        required
      />
      <input
        className="w-full border rounded-xl px-3 py-2"
        placeholder="Class (e.g., Class 6)"
        value={student_class}
        onChange={e=>setKlass(e.target.value)}
        required
      />
      <input
        className="w-full border rounded-xl px-3 py-2"
        placeholder="Parent WhatsApp (e.g., 91XXXXXXXXXX)"
        value={parent_phone}
        onChange={e=>setPhone(e.target.value)}
        required
      />
      <button
        className="btn btn-primary"
        type="submit"
        disabled={loading}
      >
        {loading ? "Submitting..." : "Submit"}
      </button>
      {msg && <div className="text-sm text-gray-700">{msg}</div>}
    </form>
  );
}
