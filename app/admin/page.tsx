"use client";
import { useState } from "react";
type Lead = { id?:string; student_name:string; student_class:string; parent_phone:string; source:string; created_at:string };
export default function AdminPage(){
  const [pwd,setPwd]=useState(""); const [rows,setRows]=useState<Lead[]|null>(null); const [err,setErr]=useState<string|undefined>();
  async function load(){ setErr(undefined);
    try{
      const res = await fetch(`/api/admin/leads?auth=${encodeURIComponent(pwd)}`);
      if(!res.ok){ setErr(`Error ${res.status}: Unauthorized or server error`); setRows([]); return; }
      const js = await res.json(); setRows(js.data||[]);
    }catch(e){ setErr("Network error"); setRows([]); }
  }
  const exportUrl = pwd ? `/api/admin/export?auth=${encodeURIComponent(pwd)}` : "#";
  return (<div className="container py-8">
    <h1 className="text-2xl font-bold mb-4">NeoLearn Admin — Leads</h1>
    <div className="flex gap-2 items-center mb-4">
      <input type="password" className="border rounded-xl px-3 py-2" placeholder="Admin password" value={pwd} onChange={e=>setPwd(e.target.value)} onKeyDown={e=>{if(e.key==="Enter") load();}}/>
      <button className="btn btn-primary" onClick={load}>Load</button>
      <a className="btn btn-ghost" href={exportUrl} target="_blank" rel="noreferrer">Export CSV</a>
      {err && <div className="text-red-600 ml-3">{err}</div>}
      {rows && <div className="text-gray-500 ml-3">Rows: {rows.length}</div>}
    </div>
    {rows !== null && rows.length === 0 && <div className="text-gray-600 mb-3">No leads yet. Submit the form on the homepage to add one.</div>}
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr className="text-left border-b">
          <th className="p-2">Created</th><th className="p-2">Student</th><th className="p-2">Class</th><th className="p-2">Phone</th><th className="p-2">Source</th>
        </tr></thead>
        <tbody>{(rows||[]).map((r,i)=>(<tr key={r.id || i} className="border-b">
          <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
          <td className="p-2">{r.student_name}</td>
          <td className="p-2">{r.student_class}</td>
          <td className="p-2">{r.parent_phone}</td>
          <td className="p-2">{r.source}</td>
        </tr>))}</tbody>
      </table>
    </div>
  </div>);
}
