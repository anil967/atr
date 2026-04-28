import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Module-level singleton Supabase client.
 * HARDCODED keys to bypass Cloudflare environment variable injection issues.
 * This is a temporary measure to ensure the site works immediately.
 */
let _client: SupabaseClient | null = null;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}
