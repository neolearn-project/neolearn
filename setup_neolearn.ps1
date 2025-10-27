
# NeoLearn one-click local setup (server-only build)
# Run this script by right-clicking -> "Run with PowerShell"
$ErrorActionPreference = "Stop"

function Section($msg){ Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# Move to the script directory
Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)

Section "Checking Node.js"
try {
  node -v | Out-Null
  npm -v  | Out-Null
  Write-Host "Node & npm found." -ForegroundColor Green
} catch {
  Write-Warning "Node.js is not installed. Install LTS from https://nodejs.org and re-run this script."
  exit 1
}

Section "Creating folders"
$dirs = @(
  "app","components","public","styles","lib",
  "app\api\lead","app\api\admin\leads","app\api\env-check","app\api\db-check","app\health"
)
foreach($d in $dirs){ New-Item -ItemType Directory -Force -Path $d | Out-Null }

Section "Writing core files"

@'
@tailwind base;@tailwind components;@tailwind utilities;
:root { --brand:#0b1b3a; --accent:##00c6ff; }
body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, "Helvetica Neue"; background:#f9fafb; color:#111827; }
.container { max-width: 72rem; margin: 0 auto; padding: 0 1rem; }
.btn { display:inline-flex; align-items:center; gap:.5rem; padding:.75rem 1.25rem; border-radius: .75rem; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
.btn-primary { background:#2563eb; color:white; }
.btn-ghost { background:white; border:1px solid #bfdbfe; }
.card { background:white; border:1px solid #e5e7eb; border-radius: 1rem; padding: 1.25rem; box-shadow: 0 1px 2px rgba(0,0,0,.03); }
'@ | Set-Content -Encoding utf8 styles\globals.css

@'
<svg width="220" height="36" viewBox="0 0 220 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<style>.word{font:700 28px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,"Helvetica Neue"; fill:#0b1b3a}</style>
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00c6ff"/><stop offset="1" stop-color="#7b61ff"/></linearGradient></defs>
<text x="0" y="26" class="word">Ne</text>
<g transform="translate(44,2)">
  <circle cx="14" cy="16" r="12.5" fill="url(#g)"/>
  <line x1="7" y1="23" x2="21" y2="9" stroke="white" stroke-width="4" stroke-linecap="round"/>
</g>
<text x="78" y="26" class="word">Learn</text></svg>
'@ | Set-Content -Encoding utf8 public\logo.svg

@'
export const metadata = { title: "NeoLearn — The Future of Learning", description: "AI-powered education for every child." };
import "../styles/globals.css";
export default function RootLayout({ children }:{children:React.ReactNode}) {
  return (<html lang="en"><body>{children}</body></html>);
}
'@ | Set-Content -Encoding utf8 app\layout.tsx

@'
"use client";
import Image from "next/image";
import ChatWidget from "@/components/ChatWidget";
import LeadForm from "@/components/LeadForm";

const WP = process.env.NEXT_PUBLIC_WHATSAPP || "918000000000";

export default function Page(){
  return (<div>
    <section className="container pt-12 pb-10">
      <div className="flex flex-col md:flex-row items-center gap-8">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-5">
            <Image src="/logo.svg" width={220} height={36} alt="NeoLearn logo"/>
            <span className="text-sm text-gray-600 ml-1">The Future of Learning</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-4">
            AI Teachers for Every Child, <span className="text-blue-600">Anytime</span>.
          </h1>
          <p className="text-lg text-gray-600 mb-6">
            NeoLearn gives your child a personal AI teacher — lessons, doubt solving, and weekly progress reports.
          </p>
          <div className="flex gap-3">
            <a href="#demo" className="btn btn-primary">Book Free Demo</a>
            <a href={`https://wa.me/${WP}`} className="btn btn-ghost">Chat on WhatsApp</a>
          </div>
        </div>
        <div className="flex-1">
          <div className="card">
            <h3 className="font-semibold mb-2">Subjects (Pilot)</h3>
            <ul className="list-disc ml-5 text-gray-700">
              <li>Class 6 Mathematics — Fractions, Decimals, Ratios</li>
              <li>Science & English — coming soon</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
    <section className="container grid md:grid-cols-3 gap-4 pb-6">
      <div className="card"><div className="text-xl font-bold mb-1">Learn</div><div className="text-gray-600">Short avatar videos explain each concept.</div></div>
      <div className="card"><div className="text-xl font-bold mb-1">Practice</div><div className="text-gray-600">Instant quizzes with hints and answers.</div></div>
      <div className="card"><div className="text-xl font-bold mb-1">Track</div><div className="text-gray-600">Weekly parent report with progress and focus areas.</div></div>
    </section>
    <section id="demo" className="container pb-16">
      <div className="card">
        <h3 className="text-2xl font-bold mb-2">Book a Free Demo</h3>
        <p className="text-gray-600 mb-4">We’ll confirm on WhatsApp shortly.</p>
        <LeadForm/>
      </div>
    </section>
    <footer className="bg-white border-t">
      <div className="container py-6 text-sm text-gray-600 flex items-center justify-between">
        <div>© {new Date().getFullYear()} NeoLearn</div>
        <div>Made in India • <a className="underline" href="mailto:hello@neolearn.ai">hello@neolearn.ai</a></div>
      </div>
    </footer>
    <ChatWidget/>
  </div>);
}
'@ | Set-Content -Encoding utf8 app\page.tsx

@'
"use client";
import { useState } from "react";
import { createBrowserLead } from "@/lib/leads";

export default function LeadForm(){
  const [status,setStatus]=useState<"idle"|"ok"|"err">("idle");
  const [form,setForm]=useState({name:"",klass:"Class 6",phone:""});
  async function submit(e:any){ e.preventDefault();
    try{ await createBrowserLead({ student_name:form.name, student_class:form.klass, parent_phone:form.phone, source:"form" }); setStatus("ok"); }
    catch{ setStatus("err"); }
  }
  return (<form onSubmit={submit} className="grid md:grid-cols-3 gap-3">
    <input required className="border rounded-xl px-3 py-3" placeholder="Student Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
    <select className="border rounded-xl px-3 py-3" value={form.klass} onChange={e=>setForm({...form,klass:e.target.value})}>
      {["Class 5","Class 6","Class 7","Class 8","Class 9","Class 10"].map(c=>(<option key={c} value={c}>{c}</option>))}
    </select>
    <input required className="border rounded-xl px-3 py-3" placeholder="Parent WhatsApp Number" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
    <button className="btn btn-primary md:col-span-3" type="submit">Request Demo</button>
    {status==="ok" && <div className="md:col-span-3 text-green-700">✅ Thanks! We’ll confirm on WhatsApp soon.</div>}
    {status==="err" && <div className="md:col-span-3 text-red-700">❌ Could not submit. Please WhatsApp us.</div>}
  </form>);
}
'@ | Set-Content -Encoding utf8 components\LeadForm.tsx

@'
"use client";
import { useState } from "react";
import { createBrowserLead } from "@/lib/leads";
type Msg = { role:"bot"|"you"; text:string };
const FLOW = {
  greeting: "👋 Hello! I’m Neo — your Receptionist Bot. Would you like info about Courses, Fees, or Book a Free Demo?",
  askName: "Great! What is the student's name?",
  askClass: "Thanks. Which class is the student in? (e.g., Class 6)",
  askPhone: "Please share the parent WhatsApp number.",
  booked: "✅ Demo request received! We’ll confirm on WhatsApp soon. Anything else I can help with?",
  courses: "We start with Class 6 Mathematics (Fractions, Decimals, Ratios). Science & English coming soon.",
  fees: "Intro offer: First 2 lessons are free. Monthly plans from ₹199 onwards."
};
export default function ChatWidget(){
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "bot", text: FLOW.greeting }]);
  const [stage, setStage] = useState<"greet"|"courses"|"fees"|"name"|"class"|"phone"|"done">("greet");
  const [input, setInput] = useState("");
  function send(text:string){ setMsgs(m=>[...m,{role:"you",text}]); handle(text.toLowerCase().trim()); }
  async function handle(text:string){
    if(stage==="greet"){
      if(text.includes("course")){ setMsgs(m=>[...m,{role:"bot",text:FLOW.courses}]); setStage("courses"); return; }
      if(text.includes("fee")||text.includes("price")){ setMsgs(m=>[...m,{role:"bot",text:FLOW.fees}]); setStage("fees"); return; }
      if(text.includes("demo")||text.includes("book")){ setMsgs(m=>[...m,{role:"bot",text:FLOW.askName}]); setStage("name"); return; }
      setMsgs(m=>[...m,{role:"bot",text:"Please type: Courses / Fees / Demo"}]); return;
    }
    if(stage==="courses"||stage==="fees"){
      if(text.includes("demo")){ setMsgs(m=>[...m,{role:"bot",text:FLOW.askName}]); setStage("name"); }
      return;
    }
    if(stage==="name"){ (window as any).__lead={ name:text }; setMsgs(m=>[...m,{role:"bot",text:FLOW.askClass}]); setStage("class"); return; }
    if(stage==="class"){ (window as any).__lead.class=text; setMsgs(m=>[...m,{role:"bot",text:FLOW.askPhone}]); setStage("phone"); return; }
    if(stage==="phone"){
      (window as any).__lead.phone=text; setStage("done");
      try{ await createBrowserLead({ student_name:(window as any).__lead.name, student_class:(window as any).__lead.class, parent_phone:(window as any).__lead.phone, source:"chat" }); }catch(e){}
      setMsgs(m=>[...m,{role:"bot",text:FLOW.booked}]); return;
    }
  }
  return (<>
    <button onClick={()=>setOpen(v=>!v)} className="fixed bottom-5 right-5 px-4 py-3 rounded-full shadow-lg bg-blue-600 text-white">{open?"Close":"Chat with Neo"}</button>
    {open && (<div className="fixed bottom-20 right-5 w-80 max-w-[92vw] bg-white rounded-2xl shadow-2xl border flex flex-col">
      <div className="p-3 border-b font-semibold">Neo — Receptionist Bot</div>
      <div className="p-3 h-72 overflow-y-auto">{msgs.map((m,i)=>(<div key={i} className={`mb-2 ${m.role==="bot"?"text-gray-800":"text-gray-900"}`}><div className={`inline-block px-3 py-2 rounded-2xl ${m.role==="bot"?"bg-gray-100":"bg-blue-50"}`}>{m.text}</div></div>))}</div>
      <div className="p-2 flex gap-2">
        <input className="flex-1 border rounded-xl px-3 py-2" placeholder="Type..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&input.trim()){ send(input); setInput(""); }}}/>
        <button className="px-3 py-2 rounded-xl bg-blue-600 text-white" onClick={()=>{ if(input.trim()){ send(input); setInput(""); } }}>Send</button>
      </div>
    </div>)}
  </>);
}
'@ | Set-Content -Encoding utf8 components\ChatWidget.tsx

Section "Configs (Next/Tailwind/TS)"
@'
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
'@ | Set-Content -Encoding utf8 next.config.js

@'
module.exports={content:["./app/**/*.{js,ts,jsx,tsx}","./components/**/*.{js,ts,jsx,tsx}"],theme:{extend:{}},plugins:[]};
'@ | Set-Content -Encoding utf8 tailwind.config.js

@'
module.exports={plugins:{tailwindcss:{},autoprefixer:{}}};
'@ | Set-Content -Encoding utf8 postcss.config.js

@'
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom","dom.iterable","esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "baseUrl": ".",
    "paths": { "@/*": ["*"] }
  },
  "include": ["next-env.d.ts",".next/types/**/*.ts","**/*.ts","**/*.tsx"],
  "exclude": ["node_modules"]
}
'@ | Set-Content -Encoding utf8 tsconfig.json

Section "Writing Supabase env (.env.local)"
$SUPA_URL = Read-Host "NEXT_PUBLIC_SUPABASE_URL (e.g., https://xyzcompany.supabase.co)"
$SUPA_SVC = Read-Host "SUPABASE_SERVICE_ROLE (starts with eyJ...)"
$ADMIN_PW = Read-Host "ADMIN_PASSWORD for /admin (e.g., NeoLearn2025)"
$WHATSAPP = Read-Host "Parent WhatsApp number for button (e.g., 918000000000)"

@"
NEXT_PUBLIC_SUPABASE_URL=$SUPA_URL
SUPABASE_SERVICE_ROLE=$SUPA_SVC
ADMIN_PASSWORD=$ADMIN_PW
NEXT_PUBLIC_WHATSAPP=$WHATSAPP
"@ | Set-Content -Encoding ascii .env.local

@'
import { createClient } from "@supabase/supabase-js";
export const supabaseServerAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE!;
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}
'@ | Set-Content -Encoding utf8 lib\supabaseClient.ts

@'
export async function createBrowserLead(payload:{student_name:string;student_class:string;parent_phone:string;source?:string}){
  const res = await fetch("/api/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if(!res.ok){ const t = await res.text(); throw new Error(t || "Insert failed"); }
  return await res.json();
}
'@ | Set-Content -Encoding utf8 lib\leads.ts

Section "API routes"
@'
import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabaseClient";
export async function GET(req:Request){
  const url = new URL(req.url);
  const auth = url.searchParams.get("auth") || "";
  const pass = process.env.ADMIN_PASSWORD || "";
  if(!auth || auth !== pass) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const supa = supabaseServerAdmin();
  const { data, error } = await supa.from("leads").select("*").order("created_at",{ascending:false});
  if(error) return NextResponse.json({ error:error.message }, { status:500 });
  return NextResponse.json({ data });
}
'@ | Set-Content -Encoding utf8 app\api\admin\leads\route.ts

@'
import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabaseClient";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.student_name || !body?.student_class || !body?.parent_phone) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }
    const supa = supabaseServerAdmin();
    const { error } = await supa.from("leads").insert([{
      student_name: body.student_name,
      student_class: body.student_class,
      parent_phone: body.parent_phone,
      source: body.source || "form",
    }]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e:any) {
    return NextResponse.json({ error: e.message || "bad request" }, { status: 400 });
  }
}
'@ | Set-Content -Encoding utf8 app\api\lead\route.ts

@'
import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    url_ok: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    service_len: (process.env.SUPABASE_SERVICE_ROLE || "").length,
    admin_pw_len: (process.env.ADMIN_PASSWORD || "").length,
  });
}
'@ | Set-Content -Encoding utf8 app\api\env-check\route.ts

@'
import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabaseClient";
export async function GET() {
  try {
    const supa = supabaseServerAdmin();
    const { data, error } = await supa.from("leads").select("id").limit(1);
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok:true, sampleCount: (data||[]).length });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message }, { status: 500 });
  }
}
'@ | Set-Content -Encoding utf8 app\api\db-check\route.ts

Section "Installing dependencies (npm install)"
npm install

Section "Starting Next.js on http://localhost:3004"
npm run dev
