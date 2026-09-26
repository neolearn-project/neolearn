"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { loginAgainMessage, studentAuthHeaders } from "@/app/lib/clientAuth";

type WindowValue = { grant: string; consumed: string; remaining: string; exceeded: boolean };
type Report = {
  available: boolean;
  observationalOnly: boolean;
  message?: string;
  term?: WindowValue;
  rolling5h?: WindowValue;
  rolling24h?: WindowValue;
  periodEnd?: string;
  evaluatedAt?: string;
};

const formatTime = (value?: string) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Unavailable";

function CreditCard({ title, value }: { title: string; value?: WindowValue }) {
  if (!value) return null;
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${value.exceeded ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
        {value.exceeded ? "Observed usage above limit" : "Within observed limit"}
      </span>
    </div>
    <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
      {[ ["Grant", value.grant], ["Consumed", value.consumed], ["Remaining", value.remaining] ].map(([label, amount]) =>
        <div key={label} className="rounded-2xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-bold text-slate-900">{amount}</dd></div>)}
    </dl>
  </section>;
}

export default function StudentAiCreditsPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/student/ai-credits", { cache: "no-store", headers: studentAuthHeaders() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(loginAgainMessage(response.status, body?.error));
      setReport(body);
    } catch (value) {
      setReport(null); setError(value instanceof Error ? value.message : "AI credit reporting is temporarily unavailable.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800">
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-blue-700">Observational only</p><h1 className="text-3xl font-bold text-slate-950">AI credit usage</h1></div>
        <div className="flex gap-2"><Link href="/student" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Back</Link><button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Refresh</button></div>
      </div>
      <p className="mt-3 text-sm text-slate-600">These values are informational and do not change or block your access.</p>
      {loading && <p className="mt-8 rounded-2xl bg-white p-5">Loading AI credit usage…</p>}
      {error && <p role="alert" className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">{error}</p>}
      {!loading && !error && report && !report.available && <p className="mt-8 rounded-2xl bg-white p-5">{report.message}</p>}
      {!loading && !error && report?.available && <>
        <div className="mt-8 grid gap-4"><CreditCard title="Entitlement term" value={report.term}/><CreditCard title="Rolling 5 hours" value={report.rolling5h}/><CreditCard title="Rolling 24 hours" value={report.rolling24h}/></div>
        <div className="mt-5 rounded-2xl bg-white p-4 text-sm text-slate-600"><p>Period ends: {formatTime(report.periodEnd)}</p><p>Evaluated: {formatTime(report.evaluatedAt)}</p></div>
      </>}
    </div>
  </main>;
}
