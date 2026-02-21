// lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// If you prefer to use the service role key on the server, you can do:
// const supabaseAnonKey = process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl) {
  throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL for Supabase.");
}
if (!supabaseAnonKey) {
  throw new Error("Missing env NEXT_PUBLIC_SUPABASE_ANON_KEY for Supabase.");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey);
