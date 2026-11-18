"use client";
import {useEffect,useRef,useState} from "react";
import {studentAuthHeaders} from "@/app/lib/clientAuth";
import {postAuthJson} from "@/app/lib/authClientRequest.mjs";
export default function GuardianLinkForm({studentMobile,onLinked}:{studentMobile:string;onLinked:()=>void}) {
 const [name,setName]=useState(""),[mobile,setMobile]=useState(""),[token,setToken]=useState(""),[otp,setOtp]=useState("");
 const [approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[wait,setWait]=useState(0),[message,setMessage]=useState("");
 const alive=useRef(true),lock=useRef(false),pending=useRef<AbortController|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;pending.current?.abort();};},[]);
 useEffect(()=>{if(!wait)return;const t=setTimeout(()=>setWait(n=>Math.max(0,n-1)),1000);return()=>clearTimeout(t);},[wait]);
 async function submit() {
  if(lock.current||(!token&&wait>0))return;
  if(!name.trim()||!/^([6-9]\d{9})$/.test(mobile)){setMessage("Enter the parent name and valid mobile number.");return;}
  if(token&&(!approved||!/^\d{6}$/.test(otp))){setMessage("Parent approval and the six-digit OTP are required.");return;}
  lock.current=true;setBusy(true);setMessage("");const controller=new AbortController();pending.current=controller;
  try {
   const data=await postAuthJson("/api/student/link-parent",{action:token?"verify":"start",studentMobile,parentName:name.trim(),parentMobile:mobile,...(token?{otpToken:token,otp,approveProgressAccess:approved}:{})},{headers:studentAuthHeaders(true),signal:controller.signal});
   if(!alive.current)return;
   if(token){onLinked();return;}
   setToken(data.otpToken);setWait(data.retryAfter||60);setMessage("OTP sent to parent mobile. The parent must approve access before sharing the code.");
  }catch(e:any){if(alive.current){if(e.status===429)setWait(60);setMessage(e.name==="AbortError"?"Connection timed out. Check your link status before retrying.":e.message||"Unable to link parent.");}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function resend() {if(busy||wait)return;setToken("");setOtp("");setApproved(false);setMessage("Select Send parent OTP to request a new code.");}
 return <form onSubmit={e=>{e.preventDefault();void submit();}} className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
  <p className="text-slate-700">Link a parent/guardian to view this student's progress. Existing links will not be replaced.</p>
  <input aria-label="Parent or guardian name" placeholder="Parent/guardian name" maxLength={120} disabled={busy||!!token} value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2"/>
  <input aria-label="Parent or guardian mobile" placeholder="Parent/guardian mobile" type="tel" inputMode="numeric" maxLength={10} disabled={busy||!!token} value={mobile} onChange={e=>setMobile(e.target.value.replace(/\D/g,""))} className="w-full rounded-xl border border-slate-300 px-3 py-2"/>
  {!!token&&<>
   <input aria-label="Parent approval OTP" placeholder="Six-digit parent OTP" inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={busy} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,""))} className="w-full rounded-xl border border-slate-300 px-3 py-2"/>
   <label className="flex items-start gap-2"><input type="checkbox" disabled={busy} checked={approved} onChange={e=>setApproved(e.target.checked)}/>The parent/guardian approves linking this student and viewing their learning progress.</label>
  </>}
  {message&&<p role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-800">{message}</p>}
  <button type="submit" disabled={busy||(!token&&wait>0)} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">{busy?"Please wait…":token?"Verify parent OTP and link":wait>0?`Wait ${wait}s`:"Send parent OTP"}</button>
  {!!token&&<div className="flex gap-4"><button type="button" disabled={busy||wait>0} onClick={()=>void resend()} className="text-blue-700 disabled:text-slate-500">{wait>0?`New code in ${wait}s`:"Request new code"}</button><button type="button" disabled={busy} onClick={()=>{setToken("");setOtp("");setApproved(false);setMessage("");}} className="text-blue-700">Edit parent details</button></div>}
 </form>;
}
