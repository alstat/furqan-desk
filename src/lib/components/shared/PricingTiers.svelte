<script lang="ts">
    import Icon from "@iconify/svelte";
    import { authUser, userTier, PAID_TIERS, type Tier } from "$lib/stores/auth.store";
    import { supabase } from "$lib/supabase";
    import { t } from "$lib/i18n";
    import { openUrl } from "@tauri-apps/plugin-opener";

    type PaidPlan = (typeof PAID_TIERS)[number];

    let busy = $state<PaidPlan | null>(null);
    let error = $state("");

    async function handleUpgrade(plan: PaidPlan) {
        error = "";
        const user = $authUser;
        if (!user) return;
        busy = plan;
        try {
            const { data, error: sessionErr } = await supabase.auth.getSession();
            if (sessionErr || !data.session) throw new Error("No active session");

            // The override is read only in dev builds; see supabase.ts.
            const base = import.meta.env.DEV
                ? ((import.meta.env.VITE_AYAHLAB_WEBSITE_URL as string | undefined) ?? "https://ayahlab.com")
                : "https://ayahlab.com";
            const params = new URLSearchParams({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
            });
            // "pro" is the website's default, so only the others need naming.
            const query = plan === "pro" ? "" : `?plan=${plan}`;
            await openUrl(`${base}/upgrade${query}#${params.toString()}`);
        } catch (e) {
            console.error(e);
            error = $t("billing.checkout_failed");
        } finally {
            busy = null;
        }
    }

    const cardBase =
        "flex flex-col gap-2.5 rounded-2xl border px-4 py-3";
    const cardFree = "border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446]";
    const cardStarter =
        "border-brand-gold-200 dark:border-[#c4a26e]/40 bg-brand-gold-50/60 dark:bg-[#e5c890]/10";
    const cardPro =
        "border-brand-gold-300 dark:border-[#c4a26e]/60 bg-brand-gold-50 dark:bg-[#e5c890]/20";
    const cardProPlus =
        "border-brand-gold-400 dark:border-[#c4a26e]/70 bg-linear-to-br from-brand-gold-50 to-brand-gold-100 dark:from-[#e5c890]/30 dark:to-[#e5c890]/10";

    const featureRow = "flex items-center gap-2 text-[0.6875rem] text-brand-charcoal-500 dark:text-[#c6d0f5] leading-relaxed";
    const checkIcon = "text-brand-gold-500 dark:text-brand-gold-400 shrink-0";

    const ctaPrimary =
        "cursor-pointer mt-1 w-full rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 py-1.5 " +
        "text-[0.6875rem] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 " +
        "hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 active:bg-brand-gold-600/90 transition-colors " +
        "disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5";

    const currentBadge =
        "rounded-full border border-brand-sand-200 dark:border-[#414559] px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#626880]";
    const proBadge =
        "rounded-full bg-brand-gold-400 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-gray-100";

    /**
     * Cheapest first, which is both the reading order and the ranking: a plan
     * is offered as an upgrade only when it sits above the one in hand, so a
     * Starter subscriber is shown Pro and Pro+ but not the tier they already
     * pay for, and a Pro+ subscriber is shown nothing to buy.
     */
    const ORDER: Tier[] = ["free", "starter", "pro", "pro_plus"];

    interface PlanCard {
        id: Tier;
        card: string;
        /** Feature bullets, by i18n key suffix. */
        features: number[];
        crown?: boolean;
    }

    const PLANS: PlanCard[] = [
        { id: "free", card: cardFree, features: [1, 2, 3, 4, 5, 6] },
        { id: "starter", card: cardStarter, features: [1, 2, 3, 4] },
        { id: "pro", card: cardPro, features: [1, 2, 3, 4, 5] },
        { id: "pro_plus", card: cardProPlus, features: [1, 2, 3], crown: true },
    ];

    let currentRank = $derived(Math.max(0, ORDER.indexOf($userTier)));

    function isUpgrade(id: Tier): boolean {
        return id !== "free" && ORDER.indexOf(id) > currentRank;
    }
</script>

<div class="flex flex-col gap-3">
    <p class="text-[0.6875rem] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5]">
        {$t("billing.heading")}
    </p>

    {#each PLANS as plan (plan.id)}
        <div class="{cardBase} {plan.card}">
            <div class="flex items-center gap-2">
                {#if plan.crown}
                    <Icon icon="solar:crown-star-bold-duotone" width="0.95rem" class="text-brand-gold-500 dark:text-brand-gold-400 shrink-0" />
                {/if}
                <span
                    class="text-[0.75rem] font-semibold {plan.id === 'free'
                        ? 'text-brand-charcoal-600 dark:text-[#c6d0f5]'
                        : 'text-brand-gold-600 dark:text-brand-gold-400'}"
                >
                    {$t(`billing.tier.${plan.id}.name`)}
                </span>
                <span
                    class="text-[0.6875rem] font-semibold {plan.id === 'free'
                        ? 'text-brand-charcoal-400 dark:text-[#8087a2]'
                        : 'text-brand-charcoal-500 dark:text-[#c6d0f5]'}"
                >
                    · {$t(`billing.tier.${plan.id}.price`)}
                </span>
                {#if $userTier === plan.id}
                    <span class="ml-auto {plan.id === 'free' ? currentBadge : proBadge}">
                        {$t("billing.current_plan")}
                    </span>
                {/if}
            </div>
            <p class="text-[0.6875rem] text-brand-charcoal-400 dark:text-[#8087a2]">
                {$t(`billing.tier.${plan.id}.tagline`)}
            </p>
            <ul class="flex flex-col gap-1">
                {#each plan.features as n (n)}
                    <li class={featureRow}>
                        <Icon icon="solar:check-circle-bold-duotone" width="0.9rem" class={checkIcon} />
                        {$t(`billing.tier.${plan.id}.feature${n}`)}
                    </li>
                {/each}
            </ul>
            {#if isUpgrade(plan.id)}
                <button
                    onclick={() => handleUpgrade(plan.id as PaidPlan)}
                    disabled={busy !== null}
                    class={ctaPrimary}
                >
                    {#if busy === plan.id}
                        <Icon icon="svg-spinners:ring-resize" width="0.85rem" />
                    {/if}
                    {$t("billing.upgrade")}
                </button>
            {/if}
        </div>
    {/each}

    {#if error}
        <p class="text-[0.6875rem] text-red-500 dark:text-red-400 text-center">{error}</p>
    {/if}
</div>
