// lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

function mustGet(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

// ✅ Use this for normal reads with RLS (safe for client-like access on server)
export const supabasePublic = () =>
  createClient(
    mustGet("NEXT_PUBLIC_SUPABASE_URL"),
    mustGet("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false } }
  );

// ✅ Use this ONLY on server routes that must bypass RLS / admin ops
export const supabaseAdmin = () =>
  createClient(
    mustGet("NEXT_PUBLIC_SUPABASE_URL"),
    mustGet("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
