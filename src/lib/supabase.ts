import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const isSupabaseConfigured = Boolean(url && key);

function missingConfigError(): Error {
  return new Error(
    "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.",
  );
}

// Where Google sends the browser back after the OAuth round-trip. The website's
// /auth/callback page sees `platform=desktop` and bounces the result to our
// `ayahlab://auth-callback` custom scheme, which the deep-link handler in
// +layout.svelte catches and exchanges for a session (the PKCE verifier lives
// here in the app). See the `deep-link` plugin config in tauri.conf.json.
//
// Driven by VITE_AYAHLAB_WEBSITE_URL so a dev build can target a locally-served
// website (e.g. http://localhost:5173) before the callback changes are live.
// That host must also be in the Supabase Redirect URLs allow-list.
const WEBSITE_BASE =
  (import.meta.env.VITE_AYAHLAB_WEBSITE_URL as string | undefined)?.replace(
    /\/$/,
    "",
  ) ?? "https://ayahlab.com";
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
