import { writable, derived } from "svelte/store";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "$lib/supabase";

export const authSession = writable<Session | null>(null);
export const authUser = writable<User | null>(null);
export const authLoading = writable(true);

export const isPro = derived(authUser, ($u) => $u?.app_metadata?.is_pro === true);

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
