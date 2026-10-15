import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const isSupabaseConfigured = Boolean(url && key);

function missingConfigError(): Error {
  return new Error(
    "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.",
  );
}

// Where the browser lands after Google sign-in. The result comes back to the
// app through the `ayahlab://auth-callback` deep link, which +layout.svelte
// exchanges for a session (see the `deep-link` plugin in tauri.conf.json).
// The override is read only in dev builds, so a built package always uses
// the default.
const WEBSITE_BASE = import.meta.env.DEV
  ? ((import.meta.env.VITE_AYAHLAB_WEBSITE_URL as string | undefined)?.replace(
      /\/$/,
      "",
    ) ?? "https://ayahlab.com")
  : "https://ayahlab.com";
export const OAUTH_REDIRECT_URL = `${WEBSITE_BASE}/auth/callback?platform=desktop`;

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
