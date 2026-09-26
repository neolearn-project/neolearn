"use client";

import { useEffect, useState } from "react";

type Report = {
  observationalOnly: boolean;
  enforcementActive: boolean;
  evaluatedAt: string;
  identifiersIncluded: boolean;
  categoryCounts: Record<string, string>;
  exclusionCounts: Record<string, string>;
  shadowUsage: Record<string, string>;
  latestTimestamps: Record<string, string | null>;
  findings: Array<{ category: string; observedAt: string | null; entityId?: string }>;
};

const label = (value: string) => value.replaceAll("_", " ");

function Counts({ title, values }: { title: string; values: Record<string, string> }) {
  return <section className="rounded-2xl border bg-white p-4 shadow-sm">
    <h2 className="font-semibold text-slate-900">{title}</h2>
    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
      {Object.entries(values).map(([key, value]) => <div key={key} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><dt className="capitalize text-slate-600">{label(key)}</dt><dd className="font-semibold">{value}</dd></div>)}
    </dl>
  </section>;
}

export default function AdminAiCreditMonitoringPage() {
  const [password, setPassword] = useState("");
  const [limit, setLimit] = useState("100");
  const [staleMinutes, setStaleMinutes] = useState("60");
  const [nearLimitBps, setNearLimitBps] = useState("9000");
  const [includeIdentifiers, setIncludeIdentifiers] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setPassword(sessionStorage.getItem("admin_pw") || ""); }, []);

  async function refresh() {
    setLoading(true); setError("");
    try {
      sessionStorage.setItem("admin_pw", password);
      const query = new URLSearchParams({ limit, staleMinutes, nearLimitBps, includeIdentifiers: String(includeIdentifiers) });
      const response = await fetch(`/api/admin/ai-credit-monitoring?${query}`, {
        cache: "no-store", headers: { "x-admin-password": password },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 401 ? "Administrator authentication required." : body?.error || "Monitoring is unavailable.");
      setReport(body);
    } catch (value) {
      setReport(null); setError(value instanceof Error ? value.message : "Monitoring is unavailable.");
    } finally { setLoading(false); }
  }

  return <div className="space-y-5">
    <div><p className="text-sm font-semibold text-blue-700">Read-only · observational</p><h1 className="text-2xl font-bold">AI Credit Monitor</h1><p className="mt-1 text-sm text-slate-600">This view never reconciles, repairs, settles, releases, grants, activates, or blocks access.</p></div>
    <section className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-6">
      <label className="md:col-span-2 text-sm">Admin password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
      <label className="text-sm">Result limit<input type="number" min="1" max="500" value={limit} onChange={(event) => setLimit(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
      <label className="text-sm">Stale minutes<input type="number" min="1" max="43200" value={staleMinutes} onChange={(event) => setStaleMinutes(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
      <label className="text-sm">Near-limit bps<input type="number" min="1" max="10000" value={nearLimitBps} onChange={(event) => setNearLimitBps(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
      <div className="flex flex-col justify-end gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeIdentifiers} onChange={(event) => setIncludeIdentifiers(event.target.checked)} />Include internal UUIDs</label><button type="button" onClick={() => void refresh()} disabled={loading || !password} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{loading ? "Loading…" : "Refresh"}</button></div>
    </section>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
    {!loading && !error && !report && <p className="rounded-xl bg-white p-4 text-slate-600">Authenticate and refresh to load monitoring.</p>}
    {report && <>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Evaluated {new Date(report.evaluatedAt).toLocaleString()} · enforcement inactive · identifiers {report.identifiersIncluded ? "included" : "redacted"}</div>
      <div className="grid gap-4 lg:grid-cols-3"><Counts title="Operational categories" values={report.categoryCounts}/><Counts title="Billing exclusions" values={report.exclusionCounts}/><Counts title="Shadow usage" values={report.shadowUsage}/></div>
      <section className="rounded-2xl border bg-white p-4 shadow-sm"><h2 className="font-semibold">Bounded findings</h2>{report.findings.length === 0 ? <p className="mt-3 text-sm text-slate-500">No findings for this evaluation.</p> : <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th className="p-2">Category</th><th className="p-2">Observed</th>{report.identifiersIncluded && <th className="p-2">Internal UUID</th>}</tr></thead><tbody>{report.findings.map((finding, index) => <tr key={`${finding.category}-${finding.entityId || index}`} className="border-t"><td className="p-2 capitalize">{label(finding.category)}</td><td className="p-2">{finding.observedAt ? new Date(finding.observedAt).toLocaleString() : "Unavailable"}</td>{report.identifiersIncluded && <td className="p-2 font-mono text-xs">{finding.entityId}</td>}</tr>)}</tbody></table></div>}</section>
    </>}
  </div>;
}
