"use client";

import { useEffect, useState } from "react";

type Lead = {
  id: string;
  student_name: string | null;
  class: string | null;
  phone: string | null;
  source: string | null;
  created_at: string;
  converted?: boolean | null;
};

export default function LeadsPage() {
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Lead[]>([]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/leads?pw=${encodeURIComponent(pw)}`, {
        cache: "no-store",
      });
      const js = await res.json();
      if (!res.ok || !js.ok) {
        setErr(js?.error || "Failed to load");
      } else {
        setRows(js.leads || []);
      }
    } catch (e: any) {
      setErr(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  // Optional: auto-load if you already typed it once in this session
  useEffect(() => {
    const saved = sessionStorage.getItem("admin_pw") || "";
    if (saved) {
      setPw(saved);
      // try load silently
      (async () => {
        try {
          const res = await fetch(`/api/admin/leads?pw=${encodeURIComponent(saved)}`, { cache: "no-store" });
          const js = await res.json();
          if (res.ok && js.ok) setRows(js.leads || []);
        } catch {}
      })();
    }
  }, []);

  function onLoadClick() {
    sessionStorage.setItem("admin_pw", pw);
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Leads</h1>

      <div className="flex items-center gap-2">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Admin password"
          className="border rounded-md px-3 py-2 w-80"
        />
        <button
          onClick={onLoadClick}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-md"
        >
          {loading ? "Loading…" : "Load"}
        </button>
        <a
          href="/admin/batches"
          className="ml-auto underline text-sm"
          title="Go manage batches"
        >
          Manage Batches →
        </a>
      </div>

      {err && <div className="text-red-600 text-sm">{err}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 border">Created</th>
              <th className="p-2 border">Student</th>
              <th className="p-2 border">Class</th>
              <th className="p-2 border">Phone</th>
              <th className="p-2 border">Source</th>
              <th className="p-2 border">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-2 border">{r.student_name || "-"}</td>
                <td className="p-2 border">{r.class || "-"}</td>
                <td className="p-2 border">{r.phone || "-"}</td>
                <td className="p-2 border">{r.source || "-"}</td>
                <td className="p-2 border">{r.converted ? "Converted" : "New"}</td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr>
                <td className="p-4 text-center text-gray-500" colSpan={6}>
                  No data yet. Enter admin password and click “Load”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
