import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/app/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
const MAX_BYTES = 25 * 1024 * 1024;
const PDF_TYPE = "application/pdf";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req); if (denied) return denied;
  const db = supabaseAdmin();
  const sourceId = req.nextUrl.searchParams.get("id");
  if (req.nextUrl.searchParams.get("catalog") === "1") {
    const { data, error } = await db.from("subjects").select("id,board,class_number,subject_name,chapters(id,chapter_name,topics(id,topic_name,is_active))").order("class_number");
    return NextResponse.json(error ? { ok:false,error:error.message } : { ok:true,subjects:data });
  }
  if (sourceId) {
    const [{ data: source, error }, { data: pages }, { data: mappings }] = await Promise.all([
      db.from("textbook_sources").select("*").eq("id", sourceId).maybeSingle(),
      db.from("textbook_pages").select("*").eq("source_id", sourceId).order("page_number"),
      db.from("textbook_topic_mappings").select("*").eq("source_id", sourceId),
    ]);
    return NextResponse.json(error || !source ? { ok:false,error:error?.message || "Not found" } : { ok:true,source,pages,mappings }, { status: source ? 200 : 404 });
  }
  const { data, error } = await db.from("textbook_sources").select("*").order("created_at", { ascending:false }).limit(100);
  return NextResponse.json(error ? { ok:false,error:error.message } : { ok:true,sources:data });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req); if (denied) return denied;
  const body = await req.json();
  const fields = Object.fromEntries(["board","classNumber","subject","bookName","edition"].map(k => [k,String(body?.[k]||"").trim()]));
  const fileName = String(body?.fileName || "").trim(); const fileSize = Number(body?.fileSize); const fileType = String(body?.fileType || "");
  const classNumber = Number(fields.classNumber);
  if (!fields.board || !fields.subject || !fields.bookName || !fields.edition || !Number.isInteger(classNumber) || classNumber < 1 || classNumber > 12 ||
      !fileName || fileType !== PDF_TYPE || !Number.isSafeInteger(fileSize) || fileSize < 5 || fileSize > MAX_BYTES)
    return NextResponse.json({ok:false,error:"Complete valid book metadata."},{status:400});
  const db = supabaseAdmin(); const sourceId = randomUUID();
  const { data: prior } = await db.from("textbook_sources").select("version").eq("board",fields.board).eq("class_number",classNumber)
    .eq("subject",fields.subject).eq("book_name",fields.bookName).eq("edition",fields.edition).order("version",{ascending:false}).limit(1);
  const version = Number(prior?.[0]?.version || 0) + 1;
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120) || "textbook.pdf";
  const path = `${sourceId}/${safeName}`;
  const row = { id:sourceId, board:fields.board, class_number:classNumber, subject:fields.subject, book_name:fields.bookName,
    edition:fields.edition, file_name:fileName, storage_path:path, byte_size:fileSize, sha256:null, version, status:"uploading" };
  const { data, error } = await db.from("textbook_sources").insert(row).select().single();
  if (error) return NextResponse.json({ok:false,error:error.message},{status:500});
  const signed = await db.storage.from("textbook-pdfs").createSignedUploadUrl(path, { upsert:false });
  if (signed.error) return NextResponse.json({ok:false,error:signed.error.message},{status:500});
  return NextResponse.json({ok:true,source:data,upload:{path,token:signed.data.token}},{status:201});
}

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req); if (denied) return denied;
  const body = await req.json(); const sourceId = String(body?.sourceId||""); const action = String(body?.action||"");
  if (!sourceId) return NextResponse.json({ok:false,error:"sourceId is required"},{status:400});
  const db = supabaseAdmin();
  if (action === "finalize_upload") {
    const { data: source } = await db.from("textbook_sources").select("storage_path,byte_size,status").eq("id",sourceId).maybeSingle();
    if (!source || source.status !== "uploading") return NextResponse.json({ok:false,error:"Upload is not awaiting finalization."},{status:409});
    const { data: info, error: infoError } = await db.storage.from("textbook-pdfs").info(source.storage_path);
    const actualSize = Number((info as any)?.size); const contentType = String((info as any)?.metadata?.mimetype || (info as any)?.metadata?.contentType || "");
    if (infoError || !Number.isSafeInteger(actualSize) || actualSize < 5 || actualSize > MAX_BYTES || actualSize !== Number(source.byte_size) || contentType !== PDF_TYPE)
      return NextResponse.json({ok:false,error:"Stored upload is missing or does not match the declared PDF size/type."},{status:422});
    const { error } = await db.from("textbook_sources").update({status:"queued",updated_at:new Date().toISOString()}).eq("id",sourceId).eq("status","uploading");
    return NextResponse.json(error ? {ok:false,error:error.message}:{ok:true});
  }
  if (action === "review") {
    const pageNumber = Number(body.pageNumber); const reviewedText = String(body.reviewedText||"").trim().slice(0,50000);
    const status = String(body.reviewStatus||"corrected");
    if (!Number.isInteger(pageNumber) || !["corrected","approved","needs_ocr"].includes(status)) return NextResponse.json({ok:false,error:"Invalid page review"},{status:400});
    const { error } = await db.rpc("review_textbook_page",{p_source_id:sourceId,p_page_number:pageNumber,p_reviewed_text:reviewedText,p_review_status:status});
    return NextResponse.json(error ? {ok:false,error:error.message}:{ok:true});
  }
  if (action === "save_mappings") {
    const mappings = Array.isArray(body.mappings) ? body.mappings : [];
    const { error } = await db.rpc("save_textbook_mappings",{p_source_id:sourceId,p_mappings:mappings});
    return NextResponse.json(error ? {ok:false,error:error.message}:{ok:true});
  }
  if (action === "publish") {
    const {error}=await db.rpc("publish_textbook_source",{p_source_id:sourceId});
    return NextResponse.json(error?{ok:false,error:error.message}:{ok:true},{status:error?409:200});
  }
  if (action === "unpublish") {
    const {error}=await db.rpc("unpublish_textbook_source",{p_source_id:sourceId});
    return NextResponse.json(error?{ok:false,error:error.message}:{ok:true});
  }
  return NextResponse.json({ok:false,error:"Unknown action"},{status:400});
}
