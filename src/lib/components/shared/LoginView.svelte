<script lang="ts">
    import { supabase } from "$lib/supabase";
    import { t } from "$lib/i18n";
    import Icon from "@iconify/svelte";

    let tab: "signin" | "signup" = $state("signin");

    let signinEmail = $state("");
    let signinPassword = $state("");

    let signupName = $state("");
    let signupEmail = $state("");
    let signupPassword = $state("");

    let loading = $state(false);
    let error = $state("");
    let successMsg = $state("");

    const inputClass =
        "w-full rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] px-3 py-2 text-[12px] text-brand-charcoal-500 dark:text-[#c6d0f5] placeholder-brand-charcoal-200 dark:placeholder-[#626880] outline-none focus:border-brand-gold-400 focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-brand-gold-900/30 transition-colors";

    function clearMessages() {
        error = "";
        successMsg = "";
    }

    async function handleSignIn() {
        clearMessages();
        if (!signinEmail || !signinPassword) { error = $t("auth.error_email_password_required"); return; }
        loading = true;
        const { error: err } = await supabase.auth.signInWithPassword({
            email: signinEmail,
            password: signinPassword,
        });
        loading = false;
        if (err) error = err.message;
    }

    async function handleSignUp() {
        clearMessages();
        if (!signupEmail || !signupPassword) { error = $t("auth.error_email_password_required"); return; }
        loading = true;
        const { error: err } = await supabase.auth.signUp({
            email: signupEmail,
            password: signupPassword,
            options: { data: { full_name: signupName } },
        });
        loading = false;
        if (err) {
            error = err.message;
        } else {
            successMsg = $t("auth.signup_confirm_email");
        }
    }

    async function handleForgotPassword() {
        clearMessages();
        if (!signinEmail) { error = $t("auth.error_email_required"); return; }
        loading = true;
        const { error: err } = await supabase.auth.resetPasswordForEmail(signinEmail);
        loading = false;
        if (err) {
            error = err.message;
        } else {
            successMsg = $t("auth.reset_email_sent");
        }
    }
</script>

<div class="flex flex-col gap-4">
    <!-- Tab switcher -->
    <div class="flex rounded-full border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#292c3c] p-0.5">
        <button
            onclick={() => { tab = "signin"; clearMessages(); }}
            class="flex-1 rounded-full py-1 text-[11px] font-semibold transition-colors
                   {tab === 'signin' ? 'bg-brand-gold-400 text-gray-100 shadow-sm' : 'text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#303446]'}"
        >
            {$t("auth.sign_in")}
        </button>
        <button
            onclick={() => { tab = "signup"; clearMessages(); }}
            class="flex-1 rounded-full py-1 text-[11px] font-semibold transition-colors
                   {tab === 'signup' ? 'bg-brand-gold-400 text-gray-100 shadow-sm' : 'text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#303446]'}"
        >
            {$t("auth.sign_up")}
        </button>
    </div>

    {#if tab === "signin"}
        <div class="flex flex-col gap-2.5">
            <input type="email" placeholder={$t("auth.email_address")} bind:value={signinEmail} class={inputClass} />
            <input type="password" placeholder={$t("auth.password")} bind:value={signinPassword} class={inputClass} />
            <button
                onclick={handleSignIn}
                disabled={loading}
                class="cursor-pointer mt-1 w-full rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 py-1.5
                       text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100
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
                class="cursor-pointer text-center text-[11px] text-brand-charcoal-400 dark:text-[#8087a2] hover:text-brand-gold-500 transition-colors"
            >
                {$t("auth.forgot_password")}
            </button>
        </div>
    {:else}
        <div class="flex flex-col gap-2.5">
            <input type="text" placeholder={$t("auth.full_name")} bind:value={signupName} class={inputClass} />
            <input type="email" placeholder={$t("auth.email_address")} bind:value={signupEmail} class={inputClass} />
            <input type="password" placeholder={$t("auth.password")} bind:value={signupPassword} class={inputClass} />
            <button
                onclick={handleSignUp}
                disabled={loading}
                class="cursor-pointer mt-1 w-full rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 py-1.5
                       text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100
                       hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 active:bg-brand-gold-600/90 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
                {#if loading}
                    <Icon icon="svg-spinners:ring-resize" width="0.85rem" />
                {/if}
                {$t("auth.create_account")}
            </button>
        </div>
    {/if}

    {#if error}
        <p class="text-[11px] text-red-500 dark:text-red-400 text-center">{error}</p>
    {/if}
    {#if successMsg}
        <p class="text-[11px] text-green-600 dark:text-green-400 text-center">{successMsg}</p>
    {/if}

    <!-- Pro callout -->
    <div class="rounded-2xl border border-brand-gold-200 dark:border-brand-gold-800/40 bg-brand-gold-50 dark:bg-brand-gold-900/20 px-4 py-3 flex flex-col gap-1">
        <p class="text-[11px] font-semibold text-brand-gold-700 dark:text-brand-gold-400">{$t("auth.pro_callout_title")}</p>
        <p class="text-[11px] text-brand-charcoal-400 dark:text-[#8087a2] leading-relaxed">
            {$t("auth.pro_callout_desc")}
        </p>
    </div>
</div>
