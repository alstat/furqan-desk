import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const isSupabaseConfigured = Boolean(url && key);

function missingConfigError(): Error {
    return new Error(
        "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.",
    );
}

export const supabase: SupabaseClient = isSupabaseConfigured
    ? createClient(url, key)
    : new Proxy({} as SupabaseClient, {
          get() {
              throw missingConfigError();
          },
      });
