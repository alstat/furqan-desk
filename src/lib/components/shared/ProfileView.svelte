<script lang="ts">
    import { supabase } from "$lib/supabase";
    import { authUser, isPro } from "$lib/stores/auth.store";
    import { t } from "$lib/i18n";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import PricingTiers from "./PricingTiers.svelte";

    let displayName = $derived(
        $authUser?.user_metadata?.full_name ?? $authUser?.email ?? ""
    );
    let email = $derived($authUser?.email ?? "");

    let initials = $derived(
        displayName
            .split(" ")
            .map((w: string) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "?"
    );

    async function handleSignOut() {
        await supabase.auth.signOut();
    }

    async function handleManage() {
        // Paddle's hosted customer portal. For per-user portal sessions, add a
        // small Edge Function that calls Paddle's API with paddle_customer_id.
        try {
            await openUrl("https://customer-portal.paddle.com");
        } catch (e) {
            console.error(e);
        }
    }
</script>

<div class="flex flex-col gap-4">
    <!-- Avatar + identity -->
    <div class="flex items-center gap-3">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 text-[14px] font-bold text-gray-100">
            {initials}
        </div>
        <div class="flex flex-col min-w-0">
            <span class="truncate text-[13px] font-semibold text-brand-charcoal-600 dark:text-[#c6d0f5]">{displayName}</span>
            <span class="truncate text-[11px] text-brand-charcoal-400 dark:text-[#8087a2]">{email}</span>
        </div>
        {#if $isPro}
            <span class="ml-auto shrink-0 rounded-full bg-brand-gold-400 px-2.5 py-0.5 text-[10px] font-bold text-gray-100">
                {$t("billing.tier.pro.name")}
            </span>
        {:else}
            <span class="ml-auto shrink-0 rounded-full border border-brand-sand-200 dark:border-[#414559] px-2.5 py-0.5 text-[10px] font-semibold text-brand-charcoal-300 dark:text-[#626880]">
                {$t("billing.tier.free.name")}
            </span>
        {/if}
    </div>

    {#if $isPro}
        <button
            onclick={handleManage}
            class="cursor-pointer w-full rounded-full border border-brand-sand-200 dark:border-[#414559] py-1.5
                   text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#8087a2]
                   hover:bg-brand-sand-200 dark:hover:bg-[#303446] transition-colors"
        >
            {$t("billing.manage_subscription")}
        </button>
    {:else}
        <PricingTiers />
    {/if}

    <div class="border-t border-brand-sand-200 dark:border-[#414559]"></div>

    <!-- Sign out -->
    <button
        onclick={handleSignOut}
        class="cursor-pointer w-full rounded-full border border-red-200 dark:border-red-900/40 py-1.5
               text-[11px] font-semibold text-red-500 dark:text-red-400
               hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
    >
        {$t("account.sign_out")}
    </button>
</div>
