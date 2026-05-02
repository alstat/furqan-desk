<script lang="ts">
    import { onDestroy } from "svelte";
    import Icon from "@iconify/svelte";
    import { supabase } from "$lib/supabase";
    import { authUser, isPro } from "$lib/stores/auth.store";
    import { t } from "$lib/i18n";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import PricingTiers from "./PricingTiers.svelte";
    import {
        getTokenUsageStats,
        getTierLimits,
        type TokenUsageStats,
        type TierLimits,
    } from "$lib/stores/chat-storage";

    let displayName = $derived(
        $authUser?.user_metadata?.full_name ?? $authUser?.email ?? "",
    );
    let email = $derived($authUser?.email ?? "");

    let initials = $derived(
        displayName
            .split(" ")
            .map((w: string) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "?",
    );

    let usage = $state<TokenUsageStats | null>(null);
    let limits = $state<TierLimits | null>(null);
    let loadingUsage = $state(false);
    // Tick increments every 30s so the relative countdowns recompute without
    // re-querying Supabase.
    let tick = $state(0);
    let tickHandle: ReturnType<typeof setInterval> | null = null;

    $effect(() => {
        if (!$isPro || !$authUser?.id) {
            usage = null;
            limits = null;
            return;
        }
        const userId = $authUser.id;
        const tier =
            ($authUser.app_metadata?.tier as string | undefined) ?? "pro";
        void refreshUsage(userId, tier);

        if (tickHandle === null) {
            tickHandle = setInterval(() => (tick += 1), 30_000);
        }
    });

    onDestroy(() => {
        if (tickHandle !== null) {
            clearInterval(tickHandle);
            tickHandle = null;
        }
    });

    async function refreshUsage(userId: string, tier: string) {
        loadingUsage = true;
        try {
            const [u, l] = await Promise.all([
                getTokenUsageStats(userId),
                getTierLimits(tier),
            ]);
            usage = u;
            limits = l;
        } catch (e) {
            console.error("usage fetch failed", e);
        } finally {
            loadingUsage = false;
        }
    }

    async function handleManualRefresh() {
        const userId = $authUser?.id;
        if (!userId) return;
        const tier =
            ($authUser?.app_metadata?.tier as string | undefined) ?? "pro";
        await refreshUsage(userId, tier);
    }

    async function handleSignOut() {
        await supabase.auth.signOut();
    }

    async function handleManage() {
        try {
            await openUrl("https://ayahlab.com");
        } catch (e) {
            console.error(e);
        }
    }

    function formatRelative(seconds: number): string {
        // tick is read so this recomputes when the interval fires
        void tick;
        if (seconds <= 0) return "now";
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m`;
        return `${seconds}s`;
    }

    function pctOf(used: number, total: number): number {
        if (total <= 0) return 0;
        return Math.min(100, Math.round((used / total) * 100));
    }

    function barColor(pct: number): string {
        if (pct >= 90) return "bg-red-500";
        if (pct >= 75) return "bg-amber-500";
        return "bg-brand-gold-400";
    }
</script>

<div class="flex flex-col gap-4">
    <!-- Avatar + identity -->
    <div class="flex items-center gap-3">
        <div
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 text-[14px] font-bold text-gray-100"
        >
            {initials}
        </div>
        <div class="flex flex-col min-w-0">
            <span
                class="truncate text-[13px] font-semibold text-brand-charcoal-600 dark:text-[#c6d0f5]"
                >{displayName}</span
            >
            <span
                class="truncate text-[11px] text-brand-charcoal-400 dark:text-[#8087a2]"
                >{email}</span
            >
        </div>
        {#if $isPro}
            <span
                class="ml-auto shrink-0 rounded-full bg-brand-gold-400 px-2.5 py-0.5 text-[10px] font-bold text-gray-100"
            >
                {$t("billing.tier.pro.name")}
            </span>
        {:else}
            <span
                class="ml-auto shrink-0 rounded-full border border-brand-sand-200 dark:border-[#414559] px-2.5 py-0.5 text-[10px] font-semibold text-brand-charcoal-300 dark:text-[#626880]"
            >
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

        <!-- Token usage panel -->
        <div
            class="rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#1e2030] p-3 flex flex-col gap-2.5"
        >
            <div class="flex items-center justify-between">
                <span
                    class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#8087a2]"
                >
                    {$t("account.usage.title")}
                </span>
                <button
                    onclick={handleManualRefresh}
                    disabled={loadingUsage}
                    aria-label={$t("account.usage.refresh")}
                    title={$t("account.usage.refresh")}
                    class="cursor-pointer flex h-5 w-5 items-center justify-center rounded-md text-brand-charcoal-300 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#292c3c] hover:text-brand-charcoal-600 dark:hover:text-[#c6d0f5] transition-colors disabled:opacity-50"
                >
                    <Icon
                        icon="solar:refresh-circle-bold-duotone"
                        class={loadingUsage ? "animate-spin" : ""}
                        width="0.8rem"
                    />
                </button>
            </div>

            {#if !usage || !limits}
                <p
                    class="text-[10px] text-brand-charcoal-300 dark:text-[#626880]"
                >
                    {loadingUsage ? "…" : $t("account.usage.no_usage")}
                </p>
            {:else}
                {#each [
                    {
                        heading: $t("account.usage.section_standard"),
                        sub: $t("account.usage.section_standard_sub"),
                        rows: [
                            { label: $t("account.usage.daily"),   used: usage.standard.daily.used,   cap: limits.daily_tokens,   reset: usage.standard.daily.resetInSeconds },
                            { label: $t("account.usage.weekly"),  used: usage.standard.weekly.used,  cap: limits.weekly_tokens,  reset: usage.standard.weekly.resetInSeconds },
                            { label: $t("account.usage.monthly"), used: usage.standard.monthly.used, cap: limits.monthly_tokens, reset: usage.standard.monthly.resetInSeconds },
                        ],
                    },
                    {
                        heading: $t("account.usage.section_advanced"),
                        sub: $t("account.usage.section_advanced_sub"),
                        rows: [
                            { label: $t("account.usage.daily"),   used: usage.advanced.daily.used,   cap: limits.advanced_daily_tokens,   reset: usage.advanced.daily.resetInSeconds },
                            { label: $t("account.usage.weekly"),  used: usage.advanced.weekly.used,  cap: limits.advanced_weekly_tokens,  reset: usage.advanced.weekly.resetInSeconds },
                            { label: $t("account.usage.monthly"), used: usage.advanced.monthly.used, cap: limits.advanced_monthly_tokens, reset: usage.advanced.monthly.resetInSeconds },
                        ],
                    },
                ] as section (section.heading)}
                    <div class="flex flex-col gap-1.5">
                        <div class="flex items-baseline justify-between">
                            <span
                                class="text-[10px] font-bold text-brand-charcoal-600 dark:text-[#c6d0f5]"
                            >
                                {section.heading}
                            </span>
                            <span
                                class="text-[9px] text-brand-charcoal-300 dark:text-[#626880]"
                            >
                                {section.sub}
                            </span>
                        </div>
                        {#each section.rows as row (row.label)}
                            {@const pct = pctOf(row.used, row.cap)}
                            <div class="flex flex-col gap-1 pl-1">
                                <div
                                    class="flex items-center justify-between text-[10px]"
                                >
                                    <span
                                        class="text-brand-charcoal-500 dark:text-[#c6d0f5]"
                                    >
                                        {row.label}
                                    </span>
                                    <span
                                        class="text-brand-charcoal-400 dark:text-[#8087a2]"
                                    >
                                        {row.used.toLocaleString()} / {row.cap > 0
                                            ? row.cap.toLocaleString()
                                            : $t("account.usage.unlimited")}
                                    </span>
                                </div>
                                {#if row.cap > 0}
                                    <div
                                        class="h-1 w-full overflow-hidden rounded-full bg-brand-sand-200 dark:bg-[#292c3c]"
                                    >
                                        <div
                                            class="h-full rounded-full {barColor(pct)}"
                                            style:width="{pct}%"
                                        ></div>
                                    </div>
                                {/if}
                                {#if row.reset !== null && row.used > 0}
                                    <span
                                        class="text-[9px] text-brand-charcoal-300 dark:text-[#626880]"
                                    >
                                        {$t("account.usage.resets_in").replace(
                                            "{time}",
                                            formatRelative(row.reset),
                                        )}
                                    </span>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/each}
            {/if}
        </div>
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
