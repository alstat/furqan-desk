<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import Icon from "@iconify/svelte";
    import { supabase } from "$lib/supabase";
    import {
        authUser,
        isPro,
        isProPlus,
        userTier,
        canUseAdvancedAi,
    } from "$lib/stores/auth.store";
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

    // Which rolling window this account budgets against. Free has a daily
    // allowance; the paid tiers leave daily_tokens null and manage a rolling
    // 7 days, which is long enough that a heavy session no longer costs them
    // the rest of their day. Only the binding window is shown — the monthly
    // backstop is a cost control, not a limit users are asked to manage.
    let budgetWindow = $derived(
        limits && limits.daily_tokens > 0
            ? ("daily" as const)
            : ("weekly" as const),
    );

    // Token-usage sections. The Advanced section only appears for the tiers
    // that have an Advanced allowance to spend — Free and Starter are
    // Standard-only, so showing them a 0 / 0 bar would just read as broken.
    let usageSections = $derived.by(() => {
        if (!usage || !limits) return [];
        const win = budgetWindow;
        const rowLabelKey =
            win === "daily" ? "account.usage.daily" : "account.usage.weekly";
        const sections: {
            heading: string;
            sub: string;
            note: string | null;
            rows: { label: string; used: number; cap: number; reset: number | null }[];
        }[] = [
            {
                heading: $t("account.usage.section_standard"),
                sub: $t("account.usage.section_standard_sub"),
                note: null,
                rows: [
                    {
                        label: $t(rowLabelKey),
                        used: usage.standard[win].used,
                        cap:
                            win === "daily"
                                ? limits.daily_tokens
                                : limits.weekly_tokens,
                        reset: usage.standard[win].resetInSeconds,
                    },
                ],
            },
        ];
        if ($canUseAdvancedAi) {
            sections.push({
                heading: $t("account.usage.section_advanced"),
                sub: $t("account.usage.section_advanced_sub"),
                note: null,
                rows: [
                    {
                        label: $t(rowLabelKey),
                        used: usage.advanced[win].used,
                        cap:
                            win === "daily"
                                ? limits.advanced_daily_tokens
                                : limits.advanced_weekly_tokens,
                        reset: usage.advanced[win].resetInSeconds,
                    },
                ],
            });
        }
        return sections;
    });
    // Tick increments every 30s so the relative countdowns recompute without
    // re-querying Supabase.
    let tick = $state(0);
    let tickHandle: ReturnType<typeof setInterval> | null = null;

    $effect(() => {
        // Every signed-in account has a quota worth showing now, Free included
        // — its daily allowance is the whole reason to look at this panel.
        if (!$authUser?.id) {
            usage = null;
            limits = null;
            return;
        }
        void refreshUsage($userTier);

        if (tickHandle === null) {
            tickHandle = setInterval(() => (tick += 1), 30_000);
        }
    });

    // The tier lives in the JWT's app_metadata, which is only a snapshot from
    // when the token was issued. A tier change made on the website (e.g. a
    // Pro -> Pro+ upgrade) won't reach us until the token is reissued, so
    // refresh the session whenever the profile opens to pull the latest tier
    // instead of waiting for the ~hourly auto-refresh. The TOKEN_REFRESHED
    // event updates authUser, which retriggers the usage effect with the new
    // tier.
    onMount(() => {
        void supabase.auth.refreshSession();
    });

    onDestroy(() => {
        if (tickHandle !== null) {
            clearInterval(tickHandle);
            tickHandle = null;
        }
    });

    async function refreshUsage(tier: string) {
        loadingUsage = true;
        try {
            const [u, l] = await Promise.all([
                getTokenUsageStats(),
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
        if (!$authUser?.id) return;
        // Reissue the token first so a tier change made on the website is
        // reflected here; fall back to the store's tier if the refresh fails
        // (e.g. offline) so usage still reloads.
        const { data } = await supabase.auth.refreshSession();
        const tier =
            (data.user?.app_metadata?.tier as string | undefined) ??
            $userTier;
        await refreshUsage(tier);
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

    // Group digits so large token counts stay readable (e.g. 1,234,567).
    const tokenFormatter = new Intl.NumberFormat();
    function formatTokens(n: number): string {
        return tokenFormatter.format(Math.max(0, Math.round(n)));
    }

    function barColor(pct: number): string {
        if (pct >= 90) return "bg-red-500";
        if (pct >= 75) return "bg-amber-500";
        return "bg-brand-gold-400";
    }
    const sectionLabel =
        "text-xs font-semibold uppercase tracking-wide text-brand-charcoal-300 mb-2";
    const rowLabel = "text-xs text-slate-600 dark:text-[#c6d0f5]";
    const descriptionText = "text-brand-charcoal-300 dark:text-[#838ba7]";
    const actionBtn =
        "cursor-pointer flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5] transition-colors";
</script>

<div class="flex w-full flex-col gap-4 pb-5">
    <!-- Avatar + identity -->
    <div class="flex items-center gap-3">
        <div
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 text-[0.875rem] font-bold text-gray-100"
        >
            {initials}
        </div>
        <div class="flex flex-col min-w-0">
            <span class="truncate text-sm font-semibold text-brand-charcoal-900"
                >{displayName}</span
            >
            <span class="truncate text-[0.6875rem] text-brand-charcoal-300"
                >{email}</span
            >
        </div>
        {#if $isPro}
            <div class="ml-auto flex shrink-0 items-center gap-2">
                {#if $isProPlus}
                    <span
                        class="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-linear-to-r from-amber-500 via-brand-gold-500 to-amber-600 px-3 py-1 text-[0.6875rem] font-extrabold uppercase tracking-wide text-gray-100 shadow-sm shadow-amber-500/35 ring-1 ring-inset ring-white/20 dark:border-black/20 dark:from-[#f0d9a8] dark:via-[#e5c890] dark:to-[#d4b57f] dark:text-[#292c3c] dark:shadow-black/30 dark:ring-black/10"
                    >
                        <Icon icon="solar:crown-star-bold" width="0.85rem" />
                        {$t("billing.tier.pro_plus.name")}
                    </span>
                {:else}
                    <span
                        class="inline-flex items-center gap-1.5 rounded-full border bg-linear-to-r from-brand-gold-400 via-brand-gold-500 to-brand-gold-600 px-3 py-1 text-[0.6875rem] font-extrabold uppercase tracking-wide text-gray-100 shadow-sm shadow-brand-gold-400/25 dark:from-[#e5c890] dark:via-[#d4b57f] dark:to-[#c4a26e] dark:text-[#292c3c] dark:shadow-black/20"
                    >
                        <Icon
                            icon="solar:crown-star-bold-duotone"
                            width="0.85rem"
                        />
                        {$t(`billing.tier.${$userTier}.name`)}
                    </span>
                {/if}
                <button onclick={handleManage} class={actionBtn}>
                    <Icon
                        icon="solar:arrow-right-up-bold-duotone"
                        width="0.85rem"
                    />
                    {$t("billing.manage_subscription")}
                </button>
            </div>
        {:else}
            <span
                class="ml-auto shrink-0 rounded-full border border-brand-sand-200 dark:border-[#414559] px-2.5 py-0.5 text-sm font-semibold text-brand-charcoal-300 dark:text-[#838ba7]"
            >
                {$t("billing.tier.free.name")}
            </span>
        {/if}
    </div>

    {#if $authUser}
        <div class="border-t border-brand-sand-200 dark:border-[#414559]"></div>

        <!-- Token usage panel -->
        <div class="flex items-center justify-between -mt-2">
            <span class={sectionLabel}>
                {$t("account.usage.title")}
            </span>
            <button
                onclick={handleManualRefresh}
                disabled={loadingUsage}
                aria-label={$t("account.usage.refresh")}
                title={$t("account.usage.refresh")}
                class="cursor-pointer flex h-6 w-6 mb-2 items-center justify-center rounded-md text-brand-charcoal-300 dark:text-[#838ba7] hover:bg-brand-sand-200 dark:hover:bg-[#292c3c] hover:text-brand-charcoal-500 dark:hover:text-[#c6d0f5] transition-colors disabled:opacity-50"
            >
                <Icon
                    icon="solar:refresh-circle-bold-duotone"
                    class={loadingUsage ? "animate-spin" : ""}
                    width="1rem"
                />
            </button>
        </div>

        <div class="flex flex-col space-y-3 -mt-4">
            {#if !usage || !limits}
                {#if loadingUsage}
                    <div
                        class="flex flex-col items-center justify-center gap-2 py-4 text-sm {descriptionText}"
                        role="status"
                        aria-label={$t("explorer.loading")}
                    >
                        <Icon
                            icon="ic:round-token"
                            class="animate-pulse text-brand-gold-400/70 dark:text-[#e5c890]/70"
                            width="1.75rem"
                        />
                        <span>Loading token...</span>
                    </div>
                {:else}
                    <p class="text-sm {descriptionText}">
                        {$t("account.usage.no_usage")}
                    </p>
                {/if}
            {:else}
                {#each usageSections as section (section.heading)}
                    <div
                        class="flex flex-col gap-3 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#1e2030] p-3"
                    >
                        <div class="flex items-baseline justify-between">
                            <span class="font-bold {rowLabel}">
                                {section.heading}
                            </span>
                            <span class="text-sm {descriptionText}">
                                {section.sub}
                            </span>
                        </div>
                        {#if section.note}
                            <p
                                class="flex items-center gap-1.5 rounded-lg bg-brand-gold-100 dark:bg-[#e5c890]/15 px-2.5 py-1.5 text-xs font-medium text-brand-gold-600 dark:text-brand-gold-400"
                            >
                                <Icon
                                    icon="solar:info-circle-bold-duotone"
                                    width="0.85rem"
                                    class="shrink-0"
                                />
                                {section.note}
                            </p>
                        {/if}
                        {#each section.rows as row (row.label)}
                            {@const pct = pctOf(row.used, row.cap)}
                            <div class="flex flex-col gap-1 pl-1">
                                <div
                                    class="flex items-center justify-between text-sm"
                                >
                                    <span class={rowLabel}>
                                        {row.label}
                                    </span>
                                    <span class="text-xs {descriptionText}">
                                        {#if row.cap > 0}
                                            {$t("account.usage.tokens", {
                                                used: formatTokens(row.used),
                                                total: formatTokens(row.cap),
                                            })}
                                            <span class="opacity-60"
                                                >· {$t(
                                                    "account.usage.used_pct",
                                                    { pct },
                                                )}</span
                                            >
                                        {:else}
                                            {formatTokens(row.used)} · {$t(
                                                "account.usage.unlimited",
                                            )}
                                        {/if}
                                    </span>
                                </div>
                                {#if row.cap > 0}
                                    <div
                                        class="h-1 w-full overflow-hidden rounded-full bg-brand-sand-200 dark:bg-[#292c3c]"
                                    >
                                        <div
                                            class="h-full rounded-full {barColor(
                                                pct,
                                            )}"
                                            style:width="{pct}%"
                                        ></div>
                                    </div>
                                {/if}
                                {#if row.reset !== null && row.used > 0}
                                    <span class="text-xs {descriptionText}">
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
    {/if}

    <!-- Somewhere left to go: a Pro+ subscriber is shown nothing to buy, so
         the cards are hidden rather than rendering a wall of "current plan". -->
    {#if !$isProPlus}
        <div class="border-t border-brand-sand-200 dark:border-[#414559]"></div>
        <PricingTiers />
    {/if}

    <div class="border-t border-brand-sand-200 dark:border-[#414559]"></div>

    <!-- Sign out -->
    <button
        onclick={handleSignOut}
        class="cursor-pointer flex w-full items-center justify-center rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 py-1.5 text-[0.6875rem] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 transition-colors"
    >
        {$t("account.sign_out")}
    </button>
</div>
