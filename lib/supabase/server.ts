import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin client for server routes (uses Service Role).
 * Works on Vercel Node runtimes and locally.
 */
export function supabaseServerAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE
  );
}
