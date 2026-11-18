"use client";
import {useEffect,useRef,useState} from "react";
import {Eye,EyeOff} from "lucide-react";
import {postAuthJson} from "@/app/lib/authClientRequest.mjs";
type Props={role?:"student"|"parent";defaultMobile?:string;onSuccess?:()=>void;onCancel?:()=>void};
export default function ResetPasswordForm({role="student",defaultMobile="",onSuccess,onCancel}:Props) {
 const [mobile,setMobile]=useState(typeof defaultMobile==="string"?defaultMobile:""),[sentMobile,setSentMobile]=useState("");
 const [otp,setOtp]=useState(""),[token,setToken]=useState(""),[password,setPassword]=useState(""),[confirm,setConfirm]=useState("");
 const [show,setShow]=useState(false),[busy,setBusy]=useState(false),[wait,setWait]=useState(0),[message,setMessage]=useState(""),[done,setDone]=useState(false);
 const lock=useRef(false),alive=useRef(true),pending=useRef<AbortController|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;pending.current?.abort();};},[]);
 useEffect(()=>{if(!wait)return;const t=setTimeout(()=>setWait(n=>Math.max(0,n-1)),1000);return()=>clearTimeout(t);},[wait]);
 async function run(reset:boolean) {
  if(lock.current||(!reset&&wait>0))return;
  const m=reset?sentMobile:mobile.trim();
  if(!/^[6-9]\d{9}$/.test(m)){setMessage("Enter a valid registered mobile number.");return;}
  if(reset&&(!/^\d{6}$/.test(otp)||password.length<6||password.length>128||password!==confirm)){setMessage("Enter the six-digit OTP and matching passwords of 6–128 characters.");return;}
  lock.current=true;setBusy(true);setMessage("");const controller=new AbortController();pending.current=controller;
  try {
   const data=await postAuthJson(reset?"/api/auth/reset-password":"/api/auth/send-otp",{role,mobile:m,...(reset?{otpToken:token,otp,newPassword:password}:{})},{signal:controller.signal});
   if(!alive.current)return;
   if(reset){setDone(true);setPassword("");setConfirm("");setOtp("");setMessage("Password updated. Please log in with your existing account.");}
   else{setToken(data.otpToken);setSentMobile(m);setWait(data.retryAfter||60);setOtp("");setMessage(data.message);}
  }catch(e:any){if(alive.current){if(e?.status===429)setWait(60);setMessage(e?.name==="AbortError"?(reset?"Connection timed out. Try logging in before requesting another reset.":"Connection timed out. Please try again."):e?.message||"Unable to continue.");}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <div className="space-y-3">
  {message&&<p role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">{message}</p>}
  {!done&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(!!token);}}>
   <label className="block text-sm">{role==="student"?"Student":"Parent"} mobile
    <input aria-label={role+" mobile"} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} disabled={busy||!!token} value={mobile} onChange={e=>setMobile(e.target.value.replace(/\D/g,""))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"/>
   </label>
   {!!token&&<>
    <p className="text-sm text-slate-600">Recovery request for ••••••{sentMobile.slice(-4)}.</p>
    <input aria-label="Recovery OTP" placeholder="Six-digit OTP" inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={busy} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,""))} className="w-full rounded-xl border border-slate-300 px-3 py-2"/>
    <input aria-label="New password" placeholder="New password (min 6 characters)" type={show?"text":"password"} autoComplete="new-password" maxLength={128} disabled={busy} value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2"/>
    <input aria-label="Confirm new password" placeholder="Confirm new password" type={show?"text":"password"} autoComplete="new-password" maxLength={128} disabled={busy} value={confirm} onChange={e=>setConfirm(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2"/>
    <button type="button" aria-label={show?"Hide passwords":"Show passwords"} onClick={()=>setShow(s=>!s)} className="flex items-center gap-2 text-sm text-slate-700">{show?<EyeOff size={18}/>:<Eye size={18}/>} {show?"Hide":"Show"} passwords</button>
   </>}
   <button type="submit" disabled={busy||(!token&&wait>0)} className="btn btn-primary w-full">{busy?"Please wait…":token?"Verify OTP & Reset Password":wait>0?`Resend in ${wait}s`:"Send OTP"}</button>
   {!!token&&<div className="flex justify-between text-sm"><button type="button" disabled={busy||wait>0} onClick={()=>void run(false)} className="text-blue-700 disabled:text-slate-500">{wait>0?`Resend in ${wait}s`:"Resend OTP"}</button><button type="button" disabled={busy} onClick={()=>{setToken("");setOtp("");setPassword("");setConfirm("");setMessage("");}} className="text-blue-700">Change mobile</button></div>}
  </form>}
  {done&&<button type="button" className="btn btn-primary w-full" onClick={onSuccess}>Go to Login</button>}
  <button type="button" disabled={busy} className="btn btn-ghost w-full" onClick={onCancel}>Back</button>
 </div>;
}
