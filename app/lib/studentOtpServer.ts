import twilio from "twilio";
import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createStudentOtpFlow, StudentLoginError } from "./studentLoginCore.mjs";
import { parentForMobile } from "./parentIdentityServer";
import { studentForMobile } from "./studentSessionServer";
import { authRequestIp } from "./authRequestIp.mjs";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function authFailure(error: unknown) {
  const e = error as any;
  const status = e instanceof StudentLoginError ? e.status : 503;
  return Response.json({ok:false,error:e instanceof StudentLoginError ? e.message : "Authentication is temporarily unavailable. Please try again."},{status,headers:{"Cache-Control":"no-store",...(status===429?{"Retry-After":"60"}:{})}});
}
export async function authBody(req: Request) {
  const reader=req.body?.getReader();
  if(!reader)throw new StudentLoginError("Invalid request.");
  const chunks:Uint8Array[]=[];let total=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;
      if(total>8192){await reader.cancel();throw new StudentLoginError("Request is too large.",413);}chunks.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const text=new TextDecoder().decode(bytes);
  try { const body=JSON.parse(text);if(!body||Array.isArray(body)||typeof body!=="object")throw Error();return body; }
  catch { throw new StudentLoginError("Invalid request."); }
}
export function studentOtpFlow() {
  const admin=supabaseAdmin();
  const sid=process.env.TWILIO_ACCOUNT_SID, token=process.env.TWILIO_AUTH_TOKEN, service=process.env.TWILIO_VERIFY_SERVICE_SID;
  if(!sid||!token||!service) throw new StudentLoginError("OTP login is temporarily unavailable. Use password login.",503);
  const client=twilio(sid,token,{timeout:10000,autoRetry:false});
  async function rpc(name:string,args:Record<string,unknown>) {
    const r=await admin.rpc(name,args);
    if(r.error) {
      const m=String(r.error.message||"");
      if(m.includes("OTP_RATE_LIMIT"))throw new StudentLoginError("Too many requests. Please wait before requesting another OTP.",429);
      if(m.includes("OTP_BUSY"))throw new StudentLoginError("This OTP is already being checked. Please wait.",409);
      if(m.includes("OTP_INVALID")||m.includes("OTP_STALE"))throw new StudentLoginError("OTP request expired or changed. Request a new OTP.",401);
      if(m.includes("SIGNUP_EXISTS"))throw new StudentLoginError("This mobile or User ID is already registered. Please log in.",409);
      throw new StudentLoginError("Authentication is temporarily unavailable. Please try again.",503);
    }
    return r.data;
  }
  return createStudentOtpFlow({
    reserve: async ({mobile,purpose,binding,request}:any)=>({id:await rpc("student_otp_reserve",{p_mobile_hash:hash(mobile),p_ip_hash:hash(authRequestIp(request)),p_purpose:purpose,p_binding_hash:hash(binding)})}),
    resolveStudent:studentForMobile,
    resolveTarget:(purpose:string,mobile:string)=>purpose.startsWith("student_")?studentForMobile(mobile):parentForMobile(mobile),
    checkSignup:async(mobile:string,binding:string)=>{
      const username=JSON.parse(binding).username;
      const r=await admin.from("students").select("id").or(`phone.eq.${mobile},username.eq.${username}`).limit(1);
      if(r.error)throw new StudentLoginError("Unable to check your account right now.",503);
      if(r.data?.length)throw new StudentLoginError("This mobile or User ID is already registered. Please log in.",409);
    },
    send:async(mobile:string)=>{
      try {const r=await client.verify.v2.services(service).verifications.create({to:"+91"+mobile,channel:"sms"});return r.sid;}
      catch {throw new StudentLoginError("Unable to send OTP right now. Use password login or try later.",503);}
    },
    attach:async(id:string,providerSid:string|null,target:string|null)=>rpc("student_otp_attach",{p_id:id,p_sid:providerSid,p_target:target}),
    claim:async({mobile,purpose,binding,otpToken}:any)=>rpc("student_otp_claim",{p_id:otpToken,p_mobile_hash:hash(mobile),p_purpose:purpose,p_binding_hash:hash(binding),p_lease:randomUUID()}),
    check:async(providerSid:string,otp:string)=>{
      try {const r=await client.verify.v2.services(service).verificationChecks.create({verificationSid:providerSid,code:otp});return r.status==="approved";}
      catch(e:any) {if([400,404,429].includes(Number(e?.status)))return false;throw new StudentLoginError("Unable to verify OTP right now. Please try again.",503);}
    },
    finish:async(c:any,approved:boolean)=>rpc("student_otp_finish",{p_id:c.id,p_lease:c.lease,p_approved:approved})
  });
}
export function authSuccess(data:unknown,status=200) {
  return Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
}
