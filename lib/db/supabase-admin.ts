import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for scheduled jobs. Bypasses RLS — server-only.
 * Never import this from a client component.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required for jobs in live mode.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
