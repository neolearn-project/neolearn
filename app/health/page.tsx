"use client";
import { useEffect, useState } from "react";

export default function Health(){
  const [env,setEnv]=useState<any>(); const [db,setDb]=useState<any>(); const [err,setErr]=useState<string>();
  useEffect(()=>{
    fetch("/api/env-check").then(r=>r.json()).then(setEnv).catch(e=>setErr(String(e)));
    fetch("/api/db-check").then(r=>r.json()).then(setDb).catch(e=>setErr(String(e)));
  },[]);
  return (<div className="container py-10">
    <h1 className="text-2xl font-bold mb-4">NeoLearn Health</h1>
    {err && <div className="text-red-600 mb-3">Error: {err}</div>}
    <div className="grid md:grid-cols-2 gap-4">
      <div className="p-4 border rounded-xl bg-white">
        <h2 className="font-semibold mb-2">Env Check</h2>
        <pre className="text-sm bg-gray-50 p-2 rounded">{JSON.stringify(env,null,2)}</pre>
      </div>
      <div className="p-4 border rounded-xl bg-white">
        <h2 className="font-semibold mb-2">DB Check</h2>
        <pre className="text-sm bg-gray-50 p-2 rounded">{JSON.stringify(db,null,2)}</pre>
      </div>
    </div>
    <p className="mt-6 text-sm text-gray-600">If service_len is 0, set SUPABASE_SERVICE_ROLE in .env.local and restart.</p>
  </div>);
}
