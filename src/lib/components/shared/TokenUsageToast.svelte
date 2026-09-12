<!--
  AI-token budget warning.

  The window it reports is whichever one the account's tier actually budgets
  against — a rolling day on Free, a rolling week on the paid tiers — so the
  wording is picked from warning.window rather than being fixed to "weekly".

  Mirrors NewBlogToast: same card, same corner, dismissed by the same close
  button. What differs is that dismissal is durable — the crossed threshold is
  recorded, so this stays gone until the user reaches the next one, restarts
  included. See token-warning.store for the bookkeeping.
-->
<script lang="ts">
    import { onMount } from "svelte";
    import Icon from "@iconify/svelte";
    import { fade } from "svelte/transition";
    import { t } from "$lib/i18n";
    import {
        tokenWarning,
        dismissTokenWarning,
        refreshTokenWarning,
        watchTokenWarningAcks,
    } from "$lib/stores/token-warning.store";

    interface Props {
        /** Which toast slot in the corner stack this window has free. */
        positionClass?: string;
    }

    let { positionClass = "top-93 right-2.5" }: Props = $props();

    // Usage is spent in whichever window has the chat open, so every window
    // polls rather than waiting to be told. Slow enough to be invisible on the
    // Supabase side; the AI stores also refresh on demand once a reply lands.
    const POLL_MS = 3 * 60_000;
    const FIRST_CHECK_MS = 2_500;

    let warning = $derived($tokenWarning);
    // At the cap the feature is blocked rather than merely close to it, so the
    // final threshold gets its own wording and a red frame.
    let atCap = $derived(warning !== null && warning.threshold >= 100);
    // "daily" / "weekly" selects the wording; the store decides which applies.
    let win = $derived(warning?.window ?? "weekly");

    onMount(() => {
        const first = setTimeout(() => void refreshTokenWarning(), FIRST_CHECK_MS);
        const poll = setInterval(() => void refreshTokenWarning(), POLL_MS);
        const onFocus = () => void refreshTokenWarning();
        window.addEventListener("focus", onFocus);
        const unwatch = watchTokenWarningAcks();
        return () => {
            clearTimeout(first);
            clearInterval(poll);
            window.removeEventListener("focus", onFocus);
            unwatch();
        };
    });

    const tokenFormatter = new Intl.NumberFormat();

    function formatTokens(n: number): string {
        return tokenFormatter.format(Math.max(0, Math.round(n)));
    }

    function formatRelative(seconds: number | null): string {
        if (seconds === null || seconds <= 0) return "now";
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    }
</script>

{#if warning}
    <div
        transition:fade={{ duration: 200 }}
        class="fixed {positionClass} z-[150] flex items-start gap-3 px-4 py-3
                rounded-xl w-2xs
                bg-white/90 dark:bg-[#292c3c]/95
                backdrop-blur-md
                border {atCap
            ? 'border-red-300 dark:border-red-900/60'
            : 'border-brand-sand-200 dark:border-[#414559]'}
                shadow-lg shadow-stone-300/30 dark:shadow-black/40"
        role="status"
    >
        <Icon
            icon={atCap
                ? "solar:danger-circle-bold-duotone"
                : "ic:round-token"}
            width="1.1rem"
            class="shrink-0 mt-0.5 {atCap
                ? 'text-red-500 dark:text-red-400'
                : 'text-brand-gold-500 dark:text-[#e5c890]'}"
        />
        <div class="flex-1 min-w-0">
            <p
                class="text-xs font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]"
            >
                {atCap
                    ? $t(`token_warning.${win}.title_reached`)
                    : $t(`token_warning.${win}.title`)}
            </p>
            <p
                class="text-[0.6875rem] text-brand-charcoal-400 dark:text-[#838ba7] mt-0.5"
            >
                {atCap
                    ? $t(`token_warning.${win}.message_reached`, {
                          pool: $t(`token_warning.pool.${warning.pool}`),
                      })
                    : $t(`token_warning.${win}.message`, {
                          pct: warning.pct,
                          pool: $t(`token_warning.pool.${warning.pool}`),
                      })}
            </p>
            <p
                class="text-[0.6875rem] text-brand-charcoal-300 dark:text-[#626880] mt-1"
            >
                {$t("token_warning.remaining", {
                    remaining: formatTokens(warning.cap - warning.used),
                    total: formatTokens(warning.cap),
                })}
            </p>
            <!-- The rolling window means relief is gradual: this is when the
                 oldest spend ages out, not a fixed reset date. -->
            {#if warning.resetInSeconds !== null}
                <p
                    class="text-[0.6875rem] text-brand-charcoal-300 dark:text-[#626880]"
                >
                    {$t("token_warning.frees_in", {
                        time: formatRelative(warning.resetInSeconds),
                    })}
                </p>
            {/if}
        </div>
        <button
            onclick={dismissTokenWarning}
            class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg text-brand-charcoal-300 dark:text-[#626880] hover:text-brand-gold-600 dark:hover:text-[#e5c890] transition-colors"
            aria-label={$t("common.close")}
        >
            <Icon icon="solar:close-circle-bold-duotone" width="1rem" />
        </button>
    </div>
{/if}
