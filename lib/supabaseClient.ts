import { createClient } from "@supabase/supabase-js";
export const supabaseServerAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE!;
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}
