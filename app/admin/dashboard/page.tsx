// app/admin/dashboard/page.tsx
"use client";
import { useEffect, useState } from "react";

export default function Dashboard() {
  const [m, setM] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/metrics").then(r => r.json()).then(setM).catch(() => {});
  }, []);

  return (
    <section className="container p-6">
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      {!m ? <div>Loading…</div> : (
        <div className="grid md:grid-cols-4 gap-4">
          <Stat title="Leads" value={m.totals.leads}/>
          <Stat title="Students" value={m.totals.students}/>
          <Stat title="Batches" value={m.totals.batches}/>
          <Stat title="Leads (7d)" value={m.last7days}/>
        </div>
      )}
      <p className="text-sm text-gray-500 mt-6">Coming soon: funnel charts, conversion rate, WA delivery, etc.</p>
    </section>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className="card text-center">
      <div className="text-gray-500">{title}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
