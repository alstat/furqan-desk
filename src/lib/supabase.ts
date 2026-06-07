import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const isSupabaseConfigured = Boolean(url && key);

function missingConfigError(): Error {
  return new Error(
    "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.",
  );
}

// Custom URL scheme the OS hands back to the desktop app after the Google
// OAuth round-trip in the system browser (see the deep-link handler in
// +layout.svelte and the `deep-link` plugin config in tauri.conf.json).
export const OAUTH_REDIRECT_URL = "https://ayahlab.com/auth/callback";

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        // PKCE is required for the desktop OAuth flow: the browser returns
        // a `code` to our custom scheme which we exchange for a session.
        flowType: "pkce",
      },
    })
  : new Proxy({} as SupabaseClient, {
      get() {
        throw missingConfigError();
      },
    });
