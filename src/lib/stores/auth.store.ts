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

/**
 * The paid tiers, cheapest first. The tier string lives in the JWT's
 * app_metadata; "free" is the absence of a paid one.
 *
 *   starter  — Standard AI model only, on a paid quota.
 *   pro      — Standard + Advanced.
 *   pro_plus — Standard + Advanced, on stronger models and a larger quota.
 */
export const PAID_TIERS = ["starter", "pro", "pro_plus"] as const;

/** The tiers whose users may spend the Advanced model's quota. */
export const ADVANCED_TIERS = ["pro", "pro_plus"] as const;

export type Tier = "free" | (typeof PAID_TIERS)[number];

/**
 * The signed-in account's tier, normalised.
 *
 * app_metadata.tier is the source of truth, but it is only a snapshot from
 * when the token was issued and older tokens predate the field entirely — so
 * an account carrying is_pro with no recognised tier is read as "pro", which
 * is what it meant before Starter existed. Anything else, signed out included,
 * is "free".
 */
export const userTier = derived(authUser, ($u): Tier => {
    const raw = $u?.app_metadata?.tier;
    if (typeof raw === "string" && (PAID_TIERS as readonly string[]).includes(raw)) {
        return raw as Tier;
    }
    return $u?.app_metadata?.is_pro === true ? "pro" : "free";
});

/**
 * On a paid plan — Starter included. This is the "has a subscription" flag:
 * the crown badge, the pricing cards, the manage-subscription link. It is NOT
 * the AI gate any more (every signed-in account has AI, free ones on a daily
 * allowance) and it is NOT the Advanced-model gate (Starter is Standard-only).
 */
export const isPro = derived(
    userTier,
    ($tier) => (PAID_TIERS as readonly string[]).includes($tier),
);

/** The entry paid tier: a paid Standard quota, no Advanced model. */
export const isStarter = derived(userTier, ($tier) => $tier === "starter");

/** The top paid tier — its own models and quota, and a badge of its own. */
export const isProPlus = derived(userTier, ($tier) => $tier === "pro_plus");

/**
 * May use the Advanced model. Pro and Pro+ only: Free and Starter have no
 * Advanced quota, so the toggles that would spend it are hidden for them and
 * the edge function serves Standard regardless of what is asked for.
 */
export const canUseAdvancedAi = derived(userTier, ($tier) =>
    (ADVANCED_TIERS as readonly string[]).includes($tier),
);

/**
 * May use the AI features at all — which is every signed-in account. Free
 * accounts are not gated out of the AI any more; they draw on a small daily
 * token allowance, and the edge function is what enforces it. Use this, not
 * isPro, wherever an AI affordance is shown or hidden.
 */
export const canUseAi = derived(authUser, ($u) => $u !== null);

// Restore persisted session on startup then keep stores in sync with auth state changes.
if (isSupabaseConfigured) {
    supabase.auth.getSession().then(({ data }) => {
        authSession.set(data.session);
        authUser.set(data.session?.user ?? null);
        authLoading.set(false);
    });

    supabase.auth.onAuthStateChange((event, session) => {
        authSession.set(session);
        authUser.set(session?.user ?? null);

        // The AI chat's encryption key is cached for the life of the process
        // and shared by every window, so signing out has to discard it
        // explicitly — otherwise it would outlive the session that unlocked
        // it. Imported lazily so the crypto module stays out of the bundle of
        // windows that never open the chat.
        if (event === "SIGNED_OUT") {
            void import("$lib/stores/chat-key.store")
                .then((m) => m.lock())
                .catch(() => {});
        }
    });
} else {
    authLoading.set(false);
}
