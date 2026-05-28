import { NextResponse } from "next/server";
import { supabaseAnon } from "@/app/lib/supabaseAnon";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function usernameToEmail(username: string) {
  return `${username.toLowerCase()}@neolearn.in`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const username = String(body?.username || "").trim().toLowerCase();
    const password = String(body?.password || "").trim();

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: "Missing username/password." },
        { status: 400 }
      );
    }

    const email = usernameToEmail(username);

    const supabaseAnonClient = supabaseAnon();

    let authResult;
    try {
      authResult = await supabaseAnonClient.auth.signInWithPassword({
        email,
        password,
      });
    } catch (authErr: any) {
      console.error("student-login auth connection error:", authErr);
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unable to connect to authentication server. Please check internet/Supabase status.",
        },
        { status: 503 }
      );
    }

    const { data, error } = authResult;

    if (error || !data?.session || !data?.user) {
      return NextResponse.json(
        { ok: false, error: "Invalid username or password." },
        { status: 401 }
      );
    }

    const userId = data.user.id;
    const meta: any = data.user.user_metadata || {};

    const supabaseAdminClient = supabaseAdmin();

    let profile: any = null;

    // Best-effort old profile lookup. Do not fail login if schema differs.
    try {
      const prof = await supabaseAdminClient
        .from("student_profile")
        .select("*")
        .or(`user_id.eq.${userId},username.eq.${username}`)
        .maybeSingle();

      if (!prof.error && prof.data) {
        profile = prof.data;
      } else if (prof.error) {
        console.warn("student-login profile lookup skipped:", prof.error.message);
      }
    } catch (profileErr) {
      console.warn("student-login profile lookup failed:", profileErr);
    }

    const mobile =
      String(
        profile?.mobile ||
          meta?.mobile ||
          meta?.studentMobile ||
          meta?.phone ||
          ""
      ).trim();

    let child: any = null;

    // Source of truth for parent-managed class upgrade.
    if (mobile) {
      try {
        const childRes = await supabaseAdminClient
          .from("children")
          .select("id, parent_mobile, child_name, child_mobile, board, class_number, created_at")
          .eq("child_mobile", mobile)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!childRes.error && childRes.data) {
          child = childRes.data;
        } else if (childRes.error) {
          console.warn("student-login child lookup skipped:", childRes.error.message);
        }
      } catch (childErr) {
        console.warn("student-login child lookup failed:", childErr);
      }
    }

    const fullName =
      child?.child_name ||
      profile?.full_name ||
      profile?.name ||
      meta?.name ||
      meta?.full_name ||
      "Student";

    const classId =
      child?.class_number != null
        ? String(child.class_number)
        : String(profile?.class_id || profile?.classId || meta?.classId || "6");

    const board = child?.board || profile?.board || meta?.board || "CBSE";

    return NextResponse.json(
      {
        ok: true,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        },
        student: {
          user_id: userId,
          username,
          full_name: fullName,
          name: fullName,
          mobile,
          class_id: classId,
          classId,
          board,
          child_id: child?.id || null,
          parent_mobile: child?.parent_mobile || null,
        },
        sources: {
          authUser: true,
          profileFound: !!profile,
          childFound: !!child,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("student-login error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Login failed." },
      { status: 500 }
    );
  }
}
