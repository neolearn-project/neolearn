"use client";
import { useState } from "react";

export default function LeadForm() {
  const [status, setStatus] = useState<"idle" | "ok" | "err" | "dup">("idle");
  const [form, setForm] = useState({ name: "", klass: "Class 6", phone: "" });
  const [wa, setWa] = useState<string | undefined>();

  async function submit(e: any) {
    e.preventDefault();
    setStatus("idle");

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ✅ match the backend keys: klass instead of student_class
        body: JSON.stringify({
          student_name: form.name,
          klass: form.klass,
          parent_phone: form.phone,
          source: "form",
        }),
      });

      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || "Insert failed");

      // ✅ Success
      setWa(`https://wa.me/${form.phone}`);
      setStatus(js.duplicate ? "dup" : "ok");
    } catch (err) {
      console.error("Form submit error:", err);
      setStatus("err");
    }
  }

  return (
    <form onSubmit={submit} className="grid md:grid-cols-3 gap-3">
      <input
        required
        className="border rounded-xl px-3 py-3"
        placeholder="Student Name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <select
        className="border rounded-xl px-3 py-3"
        value={form.klass}
        onChange={(e) => setForm({ ...form, klass: e.target.value })}
      >
        {["Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10"].map(
          (c) => (
            <option key={c} value={c}>
              {c}
            </option>
          )
        )}
      </select>
      <input
        required
        className="border rounded-xl px-3 py-3"
        placeholder="Parent WhatsApp Number (e.g., 91XXXXXXXXXX)"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />
      <button className="btn btn-primary md:col-span-3" type="submit">
        Request Demo
      </button>

      {status === "ok" && (
        <div className="md:col-span-3 text-green-700">
          ✅ Thanks! We’ll confirm your demo on WhatsApp soon.
          {wa && (
            <>
              {" "}
              <a className="underline ml-2" target="_blank" href={wa}>
                Open WhatsApp
              </a>
            </>
          )}
        </div>
      )}

      {status === "dup" && (
        <div className="md:col-span-3 text-amber-700">
          ℹ️ You’ve already requested a demo. We’ll follow up shortly.
          {wa && (
            <>
              {" "}
              <a className="underline ml-2" target="_blank" href={wa}>
                Ping NeoLearn on WhatsApp
              </a>
            </>
          )}
        </div>
      )}

      {status === "err" && (
        <div className="md:col-span-3 text-red-700">
          ❌ Could not submit. Please WhatsApp us directly.
        </div>
      )}
    </form>
  );
}
