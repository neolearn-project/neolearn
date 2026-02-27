// lib/supabase/server.ts
import { createClient } from "@supabase/supabase-js";

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set in .env.local");
  }
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in .env.local");
  }

  return { supabaseUrl, anonKey, serviceRoleKey };
}

/**
 * Standard server-side client using the anon key.
 * Safe for normal reads/writes with RLS rules.
 */
export function supabaseServer() {
  const { supabaseUrl, anonKey } = getSupabaseEnv();

  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });
}

/**
 * Admin client for background jobs / reports.
 * Uses service-role key if available, otherwise falls back to anon key
 * so local dev keeps working.
 */
export function supabaseServerAdmin() {
  const { supabaseUrl, anonKey, serviceRoleKey } = getSupabaseEnv();
  const key: string = serviceRoleKey ?? anonKey;

  return createClient(supabaseUrl, key, {
    auth: { persistSession: false },
  });
}
