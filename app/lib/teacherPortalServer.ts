import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {cookies} from 'next/headers';
import twilio from 'twilio';
import {supabaseAdmin} from '@/lib/supabaseAdmin';
import {StudentLoginError,normalizeStudentMobile} from './studentLoginCore.mjs';
import {authRequestIp} from './authRequestIp.mjs';
export const teacherDb=supabaseAdmin;
export const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
export function teacherMutation(req:Request){const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)throw new StudentLoginError('Refresh this page and try again.',403);}
export async function teacherIdentity(){
 const token=cookies().get('neolearn_teacher')?.value;
 if(!token||!/^[a-f0-9]{64}$/.test(token))throw new StudentLoginError('Please log in as a teacher.',401);
 const db=teacherDb();const r=await db.from('teacher_portal_sessions').select('teacher_id').eq('token_hash',hash(token)).gt('expires_at',new Date().toISOString()).maybeSingle();
 if(r.error)throw new StudentLoginError('Teacher portal is temporarily unavailable.',503);
 if(!r.data)throw new StudentLoginError('Your teacher session expired. Please log in.',401);
 return r.data.teacher_id as string;
}
export async function teacherRpc(name:string,args:Record<string,unknown>){const r=await teacherDb().rpc(name,args);if(r.error){const m=r.error.message;throw new StudentLoginError(m.includes('RATE_LIMIT')?'Too many requests. Please wait.':m.includes('CONFLICT')?'Application changed. Refresh and try again.':m.includes('OTP')?'OTP expired, invalid or already being checked. Request a new OTP.':'Unable to save this change. Please try again.',m.includes('RATE_LIMIT')?429:m.includes('CONFLICT')?409:400);}return r.data;}
export async function teacherOtp(req:Request,body:any){
 const mobile=normalizeStudentMobile(body.mobile);const sid=process.env.TWILIO_ACCOUNT_SID,secret=process.env.TWILIO_AUTH_TOKEN,service=process.env.TWILIO_VERIFY_SERVICE_SID;
 if(!sid||!secret||!service)throw new StudentLoginError('Teacher OTP is temporarily unavailable.',503);
 const provider=twilio(sid,secret,{timeout:10000,autoRetry:false});
 const binding=hash('neolearn-teacher-login-v1');
 if(body.action==='start'){
 const id=await teacherRpc('teacher_otp_reserve',{p_mobile_hash:hash(mobile),p_ip_hash:hash(authRequestIp(req)),p_purpose:'teacher_login',p_binding_hash:binding});
 let verification;try{verification=await provider.verify.v2.services(service).verifications.create({to:'+91'+mobile,channel:'sms'});}catch{throw new StudentLoginError('Unable to send OTP. Please try later.',503);}
 await teacherRpc('teacher_otp_attach',{p_id:id,p_sid:verification.sid,p_target:null});return {ok:true,otpToken:id,retryAfter:60};
 }
 if(body.action!=='verify'||!/^\d{6}$/.test(body.otp||'')||!/^[a-f0-9-]{36}$/i.test(body.otpToken||''))throw new StudentLoginError('Enter the six-digit OTP.');
 const c=await teacherRpc('teacher_otp_claim',{p_id:body.otpToken,p_mobile_hash:hash(mobile),p_purpose:'teacher_login',p_binding_hash:binding,p_lease:randomUUID()});
 let approved=false;try{const check=await provider.verify.v2.services(service).verificationChecks.create({verificationSid:c.provider_sid,code:body.otp});approved=check.status==='approved';}catch{}
 await teacherRpc('teacher_otp_finish',{p_id:c.id,p_lease:c.lease,p_approved:approved});
 if(!approved)throw new StudentLoginError('OTP is invalid or expired.',401);
 const db=teacherDb();const row=await db.from('teacher_portal_profiles').upsert({mobile},{onConflict:'mobile',ignoreDuplicates:true});if(row.error)throw Error('profile');
 const p=await db.from('teacher_portal_profiles').select('id').eq('mobile',mobile).single();if(p.error)throw Error('profile');
 const token=randomBytes(32).toString('hex');const expires=new Date(Date.now()+7*86400000);
 const s=await db.from('teacher_portal_sessions').insert({teacher_id:p.data.id,token_hash:hash(token),expires_at:expires.toISOString()});if(s.error)throw Error('session');
 cookies().set('neolearn_teacher',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',expires});return {ok:true};
}
export async function teacherProfileWithMedia(id:string){
 const db=teacherDb();const p=await db.from('teacher_portal_profiles').select('*').eq('id',id).single();if(p.error)throw Error('profile');
 const m=await db.from('teacher_portal_media').select('*').eq('teacher_id',id).eq('complete',true).order('created_at',{ascending:false}).limit(100);if(m.error)throw Error('media');
 const newest=(m.data||[]).filter((item,index,all)=>all.findIndex(x=>x.kind===item.kind)===index);
 const media=await Promise.all(newest.map(async item=>{const signed=await db.storage.from('teacher-portal').createSignedUrl(item.path,600);if(signed.error)throw Error('media');return {id:item.id,kind:item.kind,url:signed.data.signedUrl};}));
 return {...p.data,media};
}
