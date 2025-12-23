// lib/supabase/server.ts
import { createClient } from "@supabase/supabase-js";

// Read environment variables once (may be undefined at type level)
const supabaseUrlEnv = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKeyEnv = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKeyEnv = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Basic sanity checks (runtime)
if (!supabaseUrlEnv) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set in .env.local");
}
if (!anonKeyEnv) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in .env.local");
}

// ✅ After checks, narrow to string for TypeScript
const supabaseUrl: string = supabaseUrlEnv;
const anonKey: string = anonKeyEnv;
const serviceRoleKey: string | undefined = serviceRoleKeyEnv;

/**
 * Standard server-side client using the anon key.
 * Safe for normal reads/writes with RLS rules.
 */
export function supabaseServer() {
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
  const key: string = serviceRoleKey ?? anonKey;

  return createClient(supabaseUrl, key, {
    auth: { persistSession: false },
  });
}
