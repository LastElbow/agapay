import { createClient } from "@supabase/supabase-js";

// Fallback to the live project Supabase public URL and publishable anon key
// so the app works out-of-the-box when extracted from GitHub without a local .env file.
const DEFAULT_SUPABASE_URL = "https://klkelzwrcuzynbneutnt.supabase.co/";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_yy_yIcW851zJrb97oWMLmw_1Y2LrM8N";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabaseClient =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;
