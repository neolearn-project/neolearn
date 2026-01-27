import { createClient } from "@supabase/supabase-js";

export function supabaseAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}
