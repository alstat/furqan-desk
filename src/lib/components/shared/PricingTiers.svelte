<script lang="ts">
    import Icon from "@iconify/svelte";
    import { authUser, isPro } from "$lib/stores/auth.store";
    import { supabase } from "$lib/supabase";
    import { t } from "$lib/i18n";
    import { openUrl } from "@tauri-apps/plugin-opener";

    type PaidPlan = "pro" | "pro_plus";
    let busy = $state<PaidPlan | null>(null);
    let error = $state("");

    async function handleUpgrade(plan: PaidPlan = "pro") {
        error = "";
        const user = $authUser;
        if (!user) return;
        busy = plan;
        try {
            const { data, error: sessionErr } = await supabase.auth.getSession();
            if (sessionErr || !data.session) throw new Error("No active session");

            const base = (import.meta.env.VITE_AYAHLAB_WEBSITE_URL as string | undefined) ?? "https://ayahlab.com";
            const params = new URLSearchParams({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
            });
            const query = plan === "pro_plus" ? "?plan=pro_plus" : "";
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
    const cardPro =
        "border-brand-gold-300 dark:border-[#c4a26e]/60 bg-brand-gold-50 dark:bg-[#e5c890]/20";
    const cardProPlus =
        "border-brand-gold-400 dark:border-[#c4a26e]/70 bg-linear-to-br from-brand-gold-50 to-brand-gold-100 dark:from-[#e5c890]/30 dark:to-[#e5c890]/10";

    const featureRow = "flex items-center gap-2 text-[11px] text-brand-charcoal-500 dark:text-[#c6d0f5] leading-relaxed";
    const checkIcon = "text-brand-gold-500 dark:text-brand-gold-400 shrink-0";

    const ctaPrimary =
        "cursor-pointer mt-1 w-full rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 py-1.5 " +
        "text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 " +
        "hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 active:bg-brand-gold-600/90 transition-colors " +
        "disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5";

    const currentBadge =
        "rounded-full border border-brand-sand-200 dark:border-[#414559] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#626880]";
    const proBadge =
        "rounded-full bg-brand-gold-400 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-100";
</script>

<div class="flex flex-col gap-3">
    <p class="text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5]">
        {$t("billing.heading")}
    </p>

    <!-- Free -->
    <div class="{cardBase} {cardFree}">
        <div class="flex items-center gap-2">
            <span class="text-[12px] font-semibold text-brand-charcoal-600 dark:text-[#c6d0f5]">
                {$t("billing.tier.free.name")}
            </span>
            <span class="text-[11px] font-semibold text-brand-charcoal-400 dark:text-[#8087a2]">
                · {$t("billing.tier.free.price")}
            </span>
            {#if !$isPro}
                <span class="ml-auto {currentBadge}">{$t("billing.current_plan")}</span>
            {/if}
        </div>
        <p class="text-[11px] text-brand-charcoal-400 dark:text-[#8087a2]">
            {$t("billing.tier.free.tagline")}
        </p>
        <ul class="flex flex-col gap-1">
            <li class={featureRow}><Icon icon="solar:check-circle-bold-duotone" width="0.9rem" class={checkIcon} />{$t("billing.tier.free.feature1")}</li>
            <li class={featureRow}><Icon icon="solar:check-circle-bold-duotone" width="0.9rem" class={checkIcon} />{$t("billing.tier.free.feature2")}</li>
            <li class={featureRow}><Icon icon="solar:check-circle-bold-duotone" width="0.9rem" class={checkIcon} />{$t("billing.tier.free.feature3")}</li>
            <li class={featureRow}><Icon icon="solar:check-circle-bold-duotone" width="0.9rem" class={checkIcon} />{$t("billing.tier.free.feature4")}</li>
            <li class={featureRow}><Icon icon="solar:check-circle-bold-duotone" width="0.9rem" class={checkIcon} />{$t("billing.tier.free.feature5")}</li>
        </ul>
    </div>

    <!-- Pro -->
    <div class="{cardBase} {cardPro}">
        <div class="flex items-center gap-2">
            <span class="text-[12px] font-semibold text-brand-gold-600 dark:text-brand-gold-400">
                {$t("billing.tier.pro.name")}
            </span>
            <span class="text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5]">
                · {$t("billing.tier.pro.price")}
            </span>
            {#if $isPro}
                <span class="ml-auto {proBadge}">{$t("billing.current_plan")}</span>
            {/if}
        </div>
        <p class="text-[11px] text-brand-charcoal-400 dark:text-[#8087a2]">
            {$t("billing.tier.pro.tagline")}
        </p>
        <ul class="flex flex-col gap-1">
            <li class={featureRow}><Icon icon="solar:check-circle-bold-duotone" width="0.9rem" class={checkIcon} />{$t("billing.tier.pro.feature1")}</li>
            <li class={featureRow}><Icon icon="solar:check-circle-bold-duotone" width="0.9rem" class={checkIcon} />{$t("billing.tier.pro.feature2")}</li>
            <li class={featureRow}><Icon icon="solar:check-circle-bold-duotone" width="0.9rem" class={checkIcon} />{$t("billing.tier.pro.feature3")}</li>
            <li class={featureRow}><Icon icon="solar:check-circle-bold-duotone" width="0.9rem" class={checkIcon} />{$t("billing.tier.pro.feature4")}</li>
        </ul>
        {#if !$isPro}
            <button onclick={() => handleUpgrade("pro")} disabled={busy !== null} class={ctaPrimary}>
                {#if busy === "pro"}
                    <Icon icon="svg-spinners:ring-resize" width="0.85rem" />
                {/if}
                {$t("billing.upgrade")}
            </button>
        {/if}
    </div>

    <!-- Pro+ -->
    <div class="{cardBase} {cardProPlus}">
        <div class="flex items-center gap-2">
            <Icon icon="solar:crown-star-bold-duotone" width="0.95rem" class="text-brand-gold-500 dark:text-brand-gold-400 shrink-0" />
            <span class="text-[12px] font-semibold text-brand-gold-600 dark:text-brand-gold-400">
                {$t("billing.tier.pro_plus.name")}
            </span>
            <span class="text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5]">
                · {$t("billing.tier.pro_plus.price")}
            </span>
        </div>
        <p class="text-[11px] text-brand-charcoal-400 dark:text-[#8087a2]">
            {$t("billing.tier.pro_plus.tagline")}
        </p>
        <ul class="flex flex-col gap-1">
            <li class={featureRow}><Icon icon="solar:check-circle-bold-duotone" width="0.9rem" class={checkIcon} />{$t("billing.tier.pro_plus.feature1")}</li>
            <li class={featureRow}><Icon icon="solar:check-circle-bold-duotone" width="0.9rem" class={checkIcon} />{$t("billing.tier.pro_plus.feature2")}</li>
            <li class={featureRow}><Icon icon="solar:check-circle-bold-duotone" width="0.9rem" class={checkIcon} />{$t("billing.tier.pro_plus.feature3")}</li>
        </ul>
        {#if !$isPro}
            <button onclick={() => handleUpgrade("pro_plus")} disabled={busy !== null} class={ctaPrimary}>
                {#if busy === "pro_plus"}
                    <Icon icon="svg-spinners:ring-resize" width="0.85rem" />
                {/if}
                {$t("billing.upgrade")}
            </button>
        {/if}
    </div>

    {#if error}
        <p class="text-[11px] text-red-500 dark:text-red-400 text-center">{error}</p>
    {/if}
</div>
