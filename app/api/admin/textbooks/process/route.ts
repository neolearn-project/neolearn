import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { requireAdmin } from "@/app/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_PAGES=250, MAX_TEXT_PER_PAGE=50000;

export async function POST(req:NextRequest) {
  const denied=requireAdmin(req); if(denied)return denied;
  const {sourceId}=await req.json(); if(!sourceId)return NextResponse.json({ok:false,error:"sourceId is required"},{status:400});
  const db=supabaseAdmin(), token=randomUUID();
  const {data:claimed,error:claimError}=await db.rpc("claim_textbook_processing",{p_source_id:sourceId,p_token:token});
  if(claimError||!claimed)return NextResponse.json({ok:false,error:claimError?.message||"Already processing or retry limit reached."},{status:409});
  try {
    const {data:source}=await db.from("textbook_sources").select("storage_path").eq("id",sourceId).single();
    if(!source)throw new Error("Textbook source not found.");
    const downloaded=await db.storage.from("textbook-pdfs").download(source.storage_path); if(downloaded.error)throw downloaded.error;
    const bytes=new Uint8Array(await downloaded.data.arrayBuffer());
    if(bytes.byteLength<5||bytes.byteLength>25*1024*1024||Buffer.from(bytes.subarray(0,5)).toString("ascii")!=="%PDF-")
      throw new Error("Stored object is not a valid PDF up to 25 MB.");
    // PDF.js may transfer/detach the supplied ArrayBuffer. Keep the validated
    // original size for the SQL metadata guard before handing bytes to PDF.js.
    const originalByteLength=bytes.byteLength;
    const sha256=createHash("sha256").update(bytes).digest("hex");
    const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
    const workerPath=resolve(process.cwd(),"node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(workerPath).href;
    const pdf=await pdfjs.getDocument({data:bytes,useSystemFonts:true}).promise;
    if(pdf.numPages<1||pdf.numPages>MAX_PAGES)throw new Error(`PDF must contain 1-${MAX_PAGES} pages.`);
    const {data:checkpoints,error:checkpointReadError}=await db.from("textbook_processing_pages").select("page_number,review_status").eq("source_id",sourceId);
    if(checkpointReadError)throw checkpointReadError;
    const complete=new Set((checkpoints||[]).filter(p=>p.page_number<=pdf.numPages).map(p=>p.page_number));
    for(let n=1;n<=pdf.numPages;n++){
      if(complete.has(n))continue;
      const page=await pdf.getPage(n); const content=await page.getTextContent();
      const text=content.items.map((item:any)=>typeof item.str==="string"?item.str:"").join(" ").replace(/\s+/g," ").trim().slice(0,MAX_TEXT_PER_PAGE);
      const needsOcr=text.length<40;
      const saved=await db.rpc("checkpoint_textbook_page",{p_source_id:sourceId,p_token:token,p_page_number:n,p_text:text,
        p_review_status:needsOcr?"needs_ocr":"extracted",p_meta:{characterCount:text.length,itemCount:content.items.length,needsOcr}});
      if(saved.error)throw saved.error;
    }
    const done=await db.rpc("finalize_textbook_processing",{p_source_id:sourceId,p_token:token,p_page_count:pdf.numPages,p_sha256:sha256,p_byte_size:originalByteLength});
    if(done.error)throw done.error;
    const {data:reviewPages}=await db.from("textbook_pages").select("page_number").eq("source_id",sourceId).eq("review_status","needs_ocr").order("page_number");
    return NextResponse.json({ok:true,pageCount:pdf.numPages,needsReview:(reviewPages||[]).map(p=>p.page_number)});
  }catch(error:any){
    await db.from("textbook_sources").update({status:"failed",processing_token:null,processing_error:String(error?.message||error).slice(0,1000),updated_at:new Date().toISOString()}).eq("id",sourceId).eq("processing_token",token);
    return NextResponse.json({ok:false,error:String(error?.message||"Processing failed")},{status:422});
  }
}
