"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { storedStudentFromResponse } from "@/app/lib/studentLoginCore.mjs";

export default function StudentOtpLogin({onDone}:{onDone:()=>void}) {
 const router=useRouter();
 const [mobile,setMobile]=useState(""),[sentMobile,setSentMobile]=useState(""),[otp,setOtp]=useState(""),[token,setToken]=useState("");
 const [wait,setWait]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const lock=useRef(false),active=useRef(true),request=useRef<AbortController|null>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;request.current?.abort();};},[]);
 useEffect(()=>{if(wait<=0)return;const timer=setTimeout(()=>setWait(n=>Math.max(0,n-1)),1000);return()=>clearTimeout(timer);},[wait]);
 async function run(verify:boolean) {
  if(lock.current)return;
  if(!verify&&wait>0)return;
  const phone=verify?sentMobile:mobile.trim();
  if(!/^[6-9]\d{9}$/.test(phone)){setMessage("Enter your registered 10-digit mobile number.");return;}
  if(verify&&!/^\d{6}$/.test(otp)){setMessage("Enter the six-digit OTP.");return;}
  lock.current=true;setBusy(true);setMessage("");
  const controller=new AbortController();request.current=controller;
  const timer=setTimeout(()=>controller.abort(),15000);
  try {
   const response=await fetch(verify?"/api/auth/student-otp-verify":"/api/auth/student-otp-start",{method:"POST",cache:"no-store",signal:controller.signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({mobile:phone,...(verify?{otpToken:token,otp}:{})})});
   const data=await response.json();
   if(!active.current||controller.signal.aborted)return;
   if(!response.ok||!data.ok){if(response.status===429)setWait(60);throw new Error(data.error||"Unable to continue. Please try again.");}
   if(verify) {
    localStorage.setItem("neolearnStudent",JSON.stringify(storedStudentFromResponse(data)));
    onDone();router.push("/student");
   } else {setToken(data.otpToken);setSentMobile(phone);setOtp("");setWait(data.retryAfter||60);setMessage(data.message);}
  }catch(e:any){if(active.current)setMessage(e?.name==="AbortError"?"Connection timed out. Please try again.":e?.message||"Unable to connect. Please try again.");}
  finally {clearTimeout(timer);lock.current=false;if(active.current)setBusy(false);}
 }
 return <form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(!!token);}}>
  <label className="block text-sm">Registered student mobile
   <input aria-label="Registered student mobile" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} disabled={!!token||busy} value={mobile} onChange={e=>setMobile(e.target.value.replace(/\D/g,""))} className="neo-mobile-auth-input mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"/>
  </label>
  {!!token&&<><p className="text-sm text-slate-600">Enter the OTP for ••••••{sentMobile.slice(-4)}.</p><label className="block text-sm">Six-digit OTP
   <input aria-label="Six-digit OTP" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} disabled={busy} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,""))} className="neo-mobile-auth-input mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"/>
  </label></>}
  {message&&<p role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">{message}</p>}
  <button type="submit" disabled={busy||(!token&&wait>0)} className="neo-mobile-auth-submit w-full rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">{busy?"Please wait…":token?"Verify and log in":wait>0?`Try again in ${wait}s`:"Send OTP"}</button>
  {!!token&&<div className="flex justify-between gap-3 text-sm"><button type="button" disabled={busy||wait>0} onClick={()=>void run(false)} className="text-blue-700 disabled:text-slate-500">{wait>0?`Resend in ${wait}s`:"Resend OTP"}</button><button type="button" disabled={busy} onClick={()=>{setToken("");setOtp("");setMessage("");}} className="text-blue-700">Change number</button></div>}
  <p className="text-xs text-slate-600">For existing student accounts. Your User ID, password and learning progress stay the same.</p>
 </form>;
}
