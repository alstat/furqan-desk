<script lang="ts">
    import { supabase } from "$lib/supabase";
    import { authUser } from "$lib/stores/auth.store";

    let displayName = $derived(
        $authUser?.user_metadata?.full_name ?? $authUser?.email ?? ""
    );
    let email = $derived($authUser?.email ?? "");
    let isPro = $derived($authUser?.user_metadata?.is_pro === true);

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
        {#if isPro}
            <span class="ml-auto shrink-0 rounded-full bg-brand-gold-400 px-2.5 py-0.5 text-[10px] font-bold text-gray-100">Pro</span>
        {:else}
            <span class="ml-auto shrink-0 rounded-full border border-brand-sand-200 dark:border-[#414559] px-2.5 py-0.5 text-[10px] font-semibold text-brand-charcoal-300 dark:text-[#626880]">Free</span>
        {/if}
    </div>

    <!-- Subscription action -->
    {#if !isPro}
        <div class="rounded-2xl border border-brand-gold-200 dark:border-brand-gold-800/40 bg-brand-gold-50 dark:bg-brand-gold-900/20 px-4 py-3 flex flex-col gap-2">
            <p class="text-[11px] font-semibold text-brand-gold-700 dark:text-brand-gold-400">Upgrade to AyahLab Pro</p>
            <p class="text-[11px] text-brand-charcoal-400 dark:text-[#8087a2] leading-relaxed">
                Advanced morphology views, unlimited manuscripts, cloud sync, and more.
            </p>
            <button class="cursor-pointer mt-0.5 w-full rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 py-1.5
                           text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100
                           hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 active:bg-brand-gold-600/90 transition-colors">
                Upgrade to Pro
            </button>
        </div>
    {:else}
        <button class="cursor-pointer w-full rounded-full border border-brand-sand-200 dark:border-[#414559] py-1.5
                       text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#8087a2]
                       hover:bg-brand-sand-200 dark:hover:bg-[#303446] transition-colors">
            Manage Subscription
        </button>
    {/if}

    <div class="border-t border-brand-sand-200 dark:border-[#414559]"></div>

    <!-- Sign out -->
    <button
        onclick={handleSignOut}
        class="cursor-pointer w-full rounded-full border border-red-200 dark:border-red-900/40 py-1.5
               text-[11px] font-semibold text-red-500 dark:text-red-400
               hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
    >
        Sign Out
    </button>
</div>
