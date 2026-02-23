import { createClient } from "@supabase/supabase-js";

export const supabaseServerAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!service) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE).");
  }

  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
