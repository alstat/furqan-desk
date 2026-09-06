<script lang="ts">
    import { onDestroy } from "svelte";
    import { supabase, OAUTH_REDIRECT_URL } from "$lib/supabase";
    import { oauthError } from "$lib/stores/auth.store";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { t } from "$lib/i18n";
    import Icon from "@iconify/svelte";
    import PasswordInput from "./PasswordInput.svelte";

    let signinEmail = $state("");
    let signinPassword = $state("");

    let loading = $state(false);
    let error = $state("");
    let successMsg = $state("");

    const inputClass =
        "w-full rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] px-3 py-2 text-[0.75rem] text-brand-charcoal-500 dark:text-[#c6d0f5] placeholder-brand-charcoal-200 dark:placeholder-[#626880] outline-none focus:border-brand-gold-400 focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20 transition-colors";

    // The Google round trip reports nothing back on its own. It ends one of
    // three ways, and only the first used to be visible:
    //
    //   * the session arrives          -> onAuthStateChange swaps this view out
    //   * the exchange fails           -> oauthError, handled below
    //   * the deep link never arrives  -> nothing at all happens, which is what
    //     an install that cannot open ayahlab:// links looks like
    //
    // The last case is why this needs a deadline: without one the spinner runs
    // forever and the user has no way to tell a broken install from a slow one.
    const OAUTH_TIMEOUT_MS = 120_000;
    let oauthTimer: ReturnType<typeof setTimeout> | null = null;

    function stopOauthWait() {
        if (oauthTimer !== null) {
            clearTimeout(oauthTimer);
            oauthTimer = null;
        }
    }

    onDestroy(stopOauthWait);

    // Surface a failed code exchange, which happens over in the deep-link
    // handler and has no other route back to this view.
    $effect(() => {
        const message = $oauthError;
        if (!message) return;
        stopOauthWait();
        loading = false;
        error = $t("auth.error_oauth_exchange", { message });
        oauthError.set(null);
    });

    function clearMessages() {
        error = "";
        successMsg = "";
    }

    async function handleSignIn() {
        clearMessages();
        if (!signinEmail || !signinPassword) {
            error = $t("auth.error_email_password_required");
            return;
        }
        loading = true;
        const { error: err } = await supabase.auth.signInWithPassword({
            email: signinEmail,
            password: signinPassword,
        });
        loading = false;
        if (err) error = err.message;
    }

    async function handleGoogleSignIn() {
        clearMessages();
        oauthError.set(null);
        stopOauthWait();
        loading = true;
        // Ask Supabase for the Google authorization URL but skip its own
        // redirect — in a desktop app we open it in the system browser and let
        // it return to our custom scheme, which the deep-link handler catches.
        const { data, error: err } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: OAUTH_REDIRECT_URL,
                skipBrowserRedirect: true,
            },
        });
        if (err || !data?.url) {
            loading = false;
            error = err?.message ?? $t("auth.error_google_signin");
            return;
        }
        try {
            await openUrl(data.url);
        } catch {
            loading = false;
            error = $t("auth.error_google_signin");
            return;
        }
        // Leave `loading` on: the session arrives asynchronously via the
        // deep-link callback and onAuthStateChange swaps this view out. The
        // deadline only fires if that never happens.
        oauthTimer = setTimeout(() => {
            oauthTimer = null;
            if (!loading) return;
            loading = false;
            error = $t("auth.error_oauth_timeout");
        }, OAUTH_TIMEOUT_MS);
    }

    async function handleForgotPassword() {
        clearMessages();
        if (!signinEmail) {
            error = $t("auth.error_email_required");
            return;
        }
        loading = true;
        const { error: err } =
            await supabase.auth.resetPasswordForEmail(signinEmail);
        loading = false;
        if (err) {
            error = err.message;
        } else {
            successMsg = $t("auth.reset_email_sent");
        }
    }
</script>

<div class="flex w-full flex-col gap-4 pb-5">
    <button
        onclick={handleGoogleSignIn}
        disabled={loading}
        class="cursor-pointer flex w-full items-center justify-center gap-2 rounded-xl border border-brand-sand-200 dark:border-[#414559]
               bg-white dark:bg-[#303446] py-2 text-[0.75rem] font-medium text-brand-charcoal-500 dark:text-[#c6d0f5]
               hover:bg-brand-sand-50 dark:hover:bg-[#414559] transition-colors
               disabled:opacity-50 disabled:cursor-not-allowed"
    >
        <Icon icon="mdi:google" width="0.95rem" />
        {$t("auth.continue_with_google")}
    </button>

    <div class="flex items-center gap-3">
        <span class="h-px flex-1 bg-brand-sand-200 dark:bg-[#414559]"></span>
        <span class="text-[0.6875rem] text-brand-charcoal-200 dark:text-[#626880]"
            >{$t("auth.or")}</span
        >
        <span class="h-px flex-1 bg-brand-sand-200 dark:bg-[#414559]"></span>
    </div>

    <div class="flex flex-col gap-2.5">
        <input
            type="email"
            placeholder={$t("auth.email_address")}
            bind:value={signinEmail}
            class={inputClass}
        />
        <PasswordInput
            placeholder={$t("auth.password")}
            bind:value={signinPassword}
            onkeydown={(e: KeyboardEvent) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    handleSignIn();
                }
            }}
            class={inputClass}
        />
        <button
            onclick={handleSignIn}
            disabled={loading}
            class="cursor-pointer mt-1 w-full rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 py-1.5
                   text-[0.6875rem] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100
                   hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 active:bg-brand-gold-600/90 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
            {#if loading}
                <Icon icon="svg-spinners:ring-resize" width="0.85rem" />
            {/if}
            {$t("auth.sign_in")}
        </button>
        <button
            onclick={handleForgotPassword}
            class="cursor-pointer text-center text-[0.6875rem] text-brand-charcoal-400 dark:text-[#8087a2] hover:text-brand-gold-500 transition-colors"
        >
            {$t("auth.forgot_password")}
        </button>
    </div>

    {#if error}
        <p class="text-[0.6875rem] text-red-500 dark:text-red-400 text-center">
            {error}
        </p>
    {/if}
    {#if successMsg}
        <p class="text-[0.6875rem] text-green-600 dark:text-green-400 text-center">
            {successMsg}
        </p>
    {/if}

    <!-- Pro callout -->
    <div
        class="rounded-2xl border border-brand-gold-200 dark:border-[#c4a26e]/40 bg-brand-gold-50 dark:bg-[#e5c890]/20 px-4 py-3 flex flex-col gap-1"
    >
        <p
            class="text-[0.6875rem] font-semibold text-brand-gold-600 dark:text-brand-gold-400"
        >
            {$t("auth.pro_callout_title")}
        </p>
        <p
            class="text-[0.6875rem] text-brand-charcoal-400 dark:text-[#8087a2] leading-relaxed"
        >
            {$t("auth.pro_callout_desc")}
        </p>
    </div>
</div>
