import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabaseClient";

export async function GET(req:Request){
  const url = new URL(req.url);
  const auth = url.searchParams.get("auth") || "";
  const pass = process.env.ADMIN_PASSWORD || "";
  if(!auth || auth !== pass) return NextResponse.json({ error:"Unauthorized" }, { status:401 });

  const supa = supabaseServerAdmin();
  const { data, error } = await supa.from("leads")
    .select("created_at,student_name,student_class,parent_phone,source")
    .order("created_at",{ascending:false});
  if(error) return NextResponse.json({ error:error.message }, { status:500 });

  const header = "created_at,student_name,student_class,parent_phone,source";
  const lines = (data||[]).map(r=>[
    r.created_at, r.student_name, r.student_class, r.parent_phone, r.source
  ].map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(","));
  const csv = [header, ...lines].join("\r\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads.csv"'
    }
  });
}
