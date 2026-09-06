import { writable, derived } from "svelte/store";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "$lib/supabase";

/**
 * Set when an OAuth callback arrives but the session exchange fails.
 *
 * The Google flow has no completion signal of its own: LoginView starts the
 * browser round trip and leaves its spinner running until onAuthStateChange
 * swaps the view out. So a failed exchange used to be completely invisible --
 * the deep link arrived, the exchange threw, and the spinner simply never
 * stopped, which looks identical to a deep link that never arrived at all.
 */
export const oauthError = writable<string | null>(null);

export const authSession = writable<Session | null>(null);
export const authUser = writable<User | null>(null);
export const authLoading = writable(true);

export const isPro = derived(authUser, ($u) => $u?.app_metadata?.is_pro === true);

// The top paid tier. The tier string lives in the JWT's app_metadata
// ("pro" | "pro_plus"); isPro covers both paid tiers, isProPlus narrows to the
// top one. Only Pro+ may use the Advanced AI model — Pro is Standard-only.
export const isProPlus = derived(
    authUser,
    ($u) =>
        $u?.app_metadata?.is_pro === true &&
        $u?.app_metadata?.tier === "pro_plus",
);

// Restore persisted session on startup then keep stores in sync with auth state changes.
if (isSupabaseConfigured) {
    supabase.auth.getSession().then(({ data }) => {
        authSession.set(data.session);
        authUser.set(data.session?.user ?? null);
        authLoading.set(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
        authSession.set(session);
        authUser.set(session?.user ?? null);
    });
} else {
    authLoading.set(false);
}
