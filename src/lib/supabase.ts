import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Module-level singleton Supabase client.
 * HARDCODED keys to bypass Cloudflare environment variable injection issues.
 * This is the ONLY way to guarantee it works on every push.
 */
let _client: SupabaseClient | null = null;

// ACTUAL HARDCODED VALUES
const SUPABASE_URL = "https://ifwrfvxtpqmqoltmpbeb.supabase.co";
const SUPABASE_SERVICE_KEY = "sb_secret_Uqu7ri__5ES1mHXO4RcPOA_nwc264KG";

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase credentials missing in code!");
  }

  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}
