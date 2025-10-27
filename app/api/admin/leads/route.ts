import { NextResponse } from "next/server";
import { supabaseServerAdmin } from "@/lib/supabaseClient";
export async function GET(req:Request){
  const url = new URL(req.url);
  const auth = url.searchParams.get("auth") || "";
  const pass = process.env.ADMIN_PASSWORD || "";
  if(!auth || auth !== pass) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const supa = supabaseServerAdmin();
  const { data, error } = await supa.from("leads").select("*").order("created_at",{ascending:false});
  if(error) return NextResponse.json({ error:error.message }, { status:500 });
  return NextResponse.json({ data });
}
