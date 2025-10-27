"use client";
import { useState } from "react";
import { createBrowserLead } from "@/lib/leads";
type Msg = { role:"bot"|"you"; text:string };
const FLOW = {
  greeting: "ðŸ‘‹ Hello! Iâ€™m Neo â€” your Receptionist Bot. Would you like info about Courses, Fees, or Book a Free Demo?",
  askName: "Great! What is the student's name?",
  askClass: "Thanks. Which class is the student in? (e.g., Class 6)",
  askPhone: "Please share the parent WhatsApp number.",
  booked: "âœ… Demo request received! Weâ€™ll confirm on WhatsApp soon. Anything else I can help with?",
  courses: "We start with Class 6 Mathematics (Fractions, Decimals, Ratios). Science & English coming soon.",
  fees: "Intro offer: First 2 lessons are free. Monthly plans from â‚¹199 onwards."
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
      <div className="p-3 border-b font-semibold">Neo â€” Receptionist Bot</div>
      <div className="p-3 h-72 overflow-y-auto">{msgs.map((m,i)=>(<div key={i} className={`mb-2 ${m.role==="bot"?"text-gray-800":"text-gray-900"}`}><div className={`inline-block px-3 py-2 rounded-2xl ${m.role==="bot"?"bg-gray-100":"bg-blue-50"}`}>{m.text}</div></div>))}</div>
      <div className="p-2 flex gap-2">
        <input className="flex-1 border rounded-xl px-3 py-2" placeholder="Type..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&input.trim()){ send(input); setInput(""); }}}/>
        <button className="px-3 py-2 rounded-xl bg-blue-600 text-white" onClick={()=>{ if(input.trim()){ send(input); setInput(""); } }}>Send</button>
      </div>
    </div>)}
  </>);
}
