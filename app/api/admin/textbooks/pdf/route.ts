import { NextRequest,NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export async function GET(req:NextRequest){
 const denied=requireAdmin(req);if(denied)return denied;const id=req.nextUrl.searchParams.get("id");
 const db=supabaseAdmin();const {data:source}=await db.from("textbook_sources").select("storage_path").eq("id",id).maybeSingle();
 if(!source)return NextResponse.json({ok:false,error:"Not found"},{status:404});
 const {data,error}=await db.storage.from("textbook-pdfs").createSignedUrl(source.storage_path,300);
 return NextResponse.json(error?{ok:false,error:error.message}:{ok:true,url:data.signedUrl});
}
