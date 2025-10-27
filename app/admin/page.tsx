"use client";

import { useEffect, useMemo, useState } from "react";

type Lead = {
  id: string;
  student_name: string;
  student_class: string;   // e.g., "Class 6"
  parent_phone: string;    // e.g., "9485016767"
  source: string;          // e.g., "form" | "api-test" | "whatsapp"
  created_at: string;      // ISO string
};

type ApiResp = { data?: Lead[]; error?: string };

function classNames(...s: (string | false | undefined)[]) {
  return s.filter(Boolean).join(" ");
}

const CLASSES = ["All", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10"];
const SOURCES = ["All", "form", "whatsapp", "api-test", "admin"];

export default function AdminPage() {
  const [pwd, setPwd] = useState("");
  const [raw, setRaw] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | undefined>();

  // filters
  const [q, setQ] = useState("");
  const [klass, setKlass] = useState("All");
  const [source, setSource] = useState("All");
  const [from, setFrom] = useState<string>(""); // YYYY-MM-DD
  const [to, setTo] = useState<string>("");

  // table
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // load saved password (so you don’t retype)
  useEffect(() => {
    const saved = localStorage.getItem("neo_admin_pwd");
    if (saved) setPwd(saved);
  }, []);

  // main fetch
  async function load() {
    setLoading(true);
    setErr(undefined);
    try {
      const url = `/api/admin/leads?auth=${encodeURIComponent(pwd)}`;
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) {
        const t = await res.text();
        setErr(t || "Unauthorized or server error");
        setRaw([]);
      } else {
        const js: ApiResp = await res.json();
        setRaw(js.data || []);
        localStorage.setItem("neo_admin_pwd", pwd);
      }
    } catch (e: any) {
      setErr(e?.message || "Network error");
      setRaw([]);
    } finally {
      setLoading(false);
      setPage(1);
    }
  }

  // filtering logic
  const filtered = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    const fromTs = from ? new Date(from + "T00:00:00").getTime() : undefined;
    const toTs = to ? new Date(to + "T23:59:59").getTime() : undefined;

    return raw.filter((r) => {
      // class & source
      if (klass !== "All" && r.student_class !== klass) return false;
      if (source !== "All" && r.source !== source) return false;

      // date range
      const t = new Date(r.created_at).getTime();
      if (fromTs && t < fromTs) return false;
      if (toTs && t > toTs) return false;

      // text search (name / phone)
      if (!qLower) return true;
      return (
        r.student_name.toLowerCase().includes(qLower) ||
        r.parent_phone.toLowerCase().includes(qLower)
      );
    });
  }, [raw, q, klass, source, from, to]);

  // pagination
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
  const start = (page - 1) * rowsPerPage;
  const pageRows = filtered.slice(start, start + rowsPerPage);

  function copyNumber(n: string) {
    navigator.clipboard.writeText(n).catch(() => {});
  }

  async function exportCsv() {
    // Simple client-side CSV from *filtered* rows (what you’re seeing)
    const headers = ["Created", "Student", "Class", "Phone", "Source"];
    const rows = filtered.map((r) => [
      new Date(r.created_at).toLocaleString(),
      r.student_name,
      r.student_class,
      r.parent_phone,
      r.source,
    ]);
    const body = [headers, ...rows].map((arr) =>
      arr.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neolearn-leads-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* top bar */}
      <div className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
            NeoLearn Admin — Leads
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Search, filter, export. Data is read-only and pulled from Supabase.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* access / actions */}
        <div className="bg-white border rounded-2xl p-4 md:p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Admin password
              </label>
              <input
                type="password"
                className="w-full border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter admin password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
              />
            </div>
            <button
              onClick={load}
              className={classNames(
                "inline-flex items-center justify-center rounded-xl px-4 py-2.5 font-medium",
                loading ? "bg-blue-300 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
              )}
              disabled={loading || !pwd}
              title="Load leads"
            >
              {loading ? "Loading…" : "Load"}
            </button>
            <button
              onClick={exportCsv}
              className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 font-medium bg-gray-100 hover:bg-gray-200 text-gray-800"
              disabled={filtered.length === 0}
              title="Export visible rows to CSV"
            >
              Export CSV
            </button>
            {err && (
              <div className="md:ml-auto text-red-600 text-sm">{err}</div>
            )}
          </div>
        </div>

        {/* filters */}
        <div className="bg-white border rounded-2xl p-4 md:p-5 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search (name or phone)
              </label>
              <input
                className="w-full border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Type to filter…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Class
              </label>
              <select
                value={klass}
                onChange={(e) => {
                  setKlass(e.target.value);
                  setPage(1);
                }}
                className="w-full border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CLASSES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source
              </label>
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setPage(1);
                }}
                className="w-full border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From
                </label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(1);
                  }}
                  className="w-full border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To
                </label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(1);
                  }}
                  className="w-full border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* stats */}
          <div className="mt-4 text-sm text-gray-600">
            Showing <span className="font-medium">{pageRows.length}</span> of{" "}
            <span className="font-medium">{total}</span> result(s)
          </div>
        </div>

        {/* table */}
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-left">Student</th>
                  <th className="px-4 py-3 text-left">Class</th>
                  <th className="px-4 py-3 text-left">Phone</th>
                  <th className="px-4 py-3 text-left">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {r.student_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs">
                        {r.student_class}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-800">{r.parent_phone}</span>
                        <button
                          onClick={() => copyNumber(r.parent_phone)}
                          className="text-xs text-blue-600 hover:underline"
                          title="Copy number"
                        >
                          Copy
                        </button>
                        <a
                          href={`https://wa.me/${r.parent_phone}`}
                          target="_blank"
                          className="text-xs text-green-600 hover:underline"
                          rel="noreferrer"
                          title="WhatsApp"
                        >
                          WhatsApp
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={classNames(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs",
                        r.source === "form" && "bg-gray-100 text-gray-700",
                        r.source === "whatsapp" && "bg-green-50 text-green-700",
                        r.source === "api-test" && "bg-amber-50 text-amber-700",
                        !["form","whatsapp","api-test"].includes(r.source) && "bg-sky-50 text-sky-700"
                      )}>
                        {r.source}
                      </span>
                    </td>
                  </tr>
                ))}

                {pageRows.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-gray-500" colSpan={5}>
                      No results match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* pager */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-4 py-3 bg-gray-50">
            <div className="flex items-center gap-2 text-sm">
              Rows per page:
              <select
                className="border rounded-lg px-2 py-1 bg-white"
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(1);
                }}
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-100 disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Prev
              </button>
              <span className="text-sm text-gray-700">
                Page <span className="font-medium">{page}</span> of{" "}
                <span className="font-medium">{totalPages}</span>
              </span>
              <button
                className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-100 disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
