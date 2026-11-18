/** @param {string} url
 * @param {unknown} body
 * @param {{headers?:Record<string,string>,signal?:AbortSignal,timeoutMs?:number}} options
 */
export async function postAuthJson(url,body,{headers={},signal,timeoutMs=30000}={}) {
 const controller=new AbortController();
 const abort=()=>controller.abort();signal?.addEventListener("abort",abort,{once:true});
 if(signal?.aborted)controller.abort();
 const timer=setTimeout(abort,timeoutMs);
 try {
  const response=await fetch(url,{method:"POST",cache:"no-store",signal:controller.signal,headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>null);
  if(controller.signal.aborted)throw new DOMException("Aborted","AbortError");
  if(!response.ok||!data?.ok) {
   const error=new Error(typeof data?.error==="string"?data.error:"Unable to continue. Please try again.");
   error.status=response.status;throw error;
  }
  return data;
 }finally{clearTimeout(timer);signal?.removeEventListener("abort",abort);}
}
