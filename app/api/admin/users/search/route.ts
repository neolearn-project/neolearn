import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabase() {
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL missing.");
  }
  if (!supabaseKey) {
    throw new Error("SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY missing.");
  }
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const query = String(url.searchParams.get("query") || "").trim();
    const adminPw =
      url.searchParams.get("pw") ||
      url.searchParams.get("auth") ||
      "";

    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "neolearn-admin-secret";

    if (adminPw !== ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!query) {
      return NextResponse.json({ ok: false, error: "Missing query." }, { status: 400 });
    }

    const supabase = getSupabase();

    const studentByMobile = await supabase
      .from("students")
      .select("*")
      .eq("phone", query)
      .limit(10);

    const studentByUsername = await supabase
      .from("students")
      .select("*")
      .eq("username", query.toLowerCase())
      .limit(10);

    const childByParentMobile = await supabase
      .from("children")
      .select("*")
      .eq("parent_mobile", query)
      .limit(20);

    const childByStudentMobile = await supabase
      .from("children")
      .select("*")
      .eq("child_mobile", query)
      .limit(20);

    const childByName = await supabase
      .from("children")
      .select("*")
      .ilike("child_name", `%${query}%`)
      .limit(20);

    const parentByMobile = await supabase
      .from("parent_profile")
      .select("*")
      .eq("mobile", query)
      .limit(10);

    const profileByMobile = await supabase
      .from("student_profile")
      .select("*")
      .eq("mobile", query)
      .limit(10);

    return NextResponse.json({
      ok: true,
      results: {
        studentsByMobile: studentByMobile.data || [],
        studentsByUsername: studentByUsername.data || [],
        childrenByParentMobile: childByParentMobile.data || [],
        childrenByStudentMobile: childByStudentMobile.data || [],
        childrenByName: childByName.data || [],
        parentProfiles: parentByMobile.data || [],
        studentProfiles: profileByMobile.data || [],
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Search failed." },
      { status: 500 }
    );
  }
}