import { NextResponse } from "next/server";
import { supabaseAnon } from "@/app/lib/supabaseAnon";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function usernameToEmail(username: string) {
  return `${username.toLowerCase()}@neolearn.in`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = String(body?.username || "").trim().toLowerCase();
    const password = String(body?.password || "").trim();

    if (!username || !password) {
      return NextResponse.json({ error: "Missing username/password." }, { status: 400 });
    }

    const email = usernameToEmail(username);

    // 1) Supabase Auth login using anon key
  const supabaseAnonClient = supabaseAnon();

const { data, error } = await supabaseAnonClient.auth.signInWithPassword({
  email,
  password,
});

    if (error || !data?.session || !data?.user) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    const userId = data.user.id;

    // 2) Fetch profile for UI convenience (optional)
    const supabaseAdminClient = supabaseAdmin();

const prof = await supabaseAdminClient
  .from("student_profile")
  .select("user_id, username, full_name, class_id, board, mobile")
  .eq("user_id", userId)
  .maybeSingle();


    // Return tokens (client can store if you want)
    return NextResponse.json(
      {
        ok: true,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        },
        student: prof.data || { user_id: userId, username },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("student-login error:", err);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}


