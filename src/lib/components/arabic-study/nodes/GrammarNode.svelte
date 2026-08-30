<!-- AI-generated grammar explanation for the studied ayah. Streams in place,
     same pattern as the Take-Home Message dialog — Pro-gated like every other
     AI surface in Morphology View. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t, locale } from "$lib/i18n";
    import { get } from "svelte/store";
    import { isPro } from "$lib/stores/auth.store";
    import { fetchVerseGrammar } from "$lib/stores/ai-verse-grammar.store";
    import { renderMarkdown } from "$lib/utils/markdown";
    import {
        formatRetryWindow,
        quotaFailure,
        quotaMessageKey,
        type QuotaFailure,
    } from "$lib/utils/ai-quota";

    interface Props {
        /** e.g. "Surah 112 (Al-Ikhlas), ayah 1: قُلْ هُوَ اللَّهُ أَحَدٌ" */
        context: string;
    }
    let { context }: Props = $props();

    let result = $state("");
    let loading = $state(false);
    let error = $state("");
    // What the server said when it refused, or null if it didn't.
    let quota = $state<QuotaFailure | null>(null);
    let controller: AbortController | null = null;

    async function generate() {
        controller?.abort();
        error = "";
        quota = null;
        result = "";
        loading = true;
        const ac = new AbortController();
        controller = ac;
        try {
            const text = await fetchVerseGrammar({
                context,
                locale: get(locale),
                signal: ac.signal,
                onPartial: (partial) => {
                    if (!ac.signal.aborted) result = partial;
                },
            });
            if (!ac.signal.aborted) result = text;
        } catch (e) {
            if (!ac.signal.aborted) {
                error = e instanceof Error ? e.message : String(e);
                quota = quotaFailure(e);
            }
        } finally {
            if (controller === ac) {
                loading = false;
                controller = null;
            }
        }
    }
</script>

<div
    class="rounded-2xl border border-[#e6cf96] bg-linear-to-b from-[#fdf6e6] to-white p-3.5 dark:border-[#6b5b37] dark:from-[#34302a] dark:to-[#292c3c]"
>
    <div class="mb-2 flex items-center gap-2">
        <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-gold-200 text-brand-gold-600 dark:bg-[#414559] dark:text-[#e5c890]"
        >
            <Icon icon="solar:bolt-bold-duotone" width="0.85rem" />
        </span>
        <h3 class="text-[0.71875rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
            {$t("arabicStudy.node.grammar")}
        </h3>
    </div>

    {#if !$isPro}
        <div class="flex flex-col items-center gap-2 py-4 text-center">
            <Icon
                icon="solar:lock-keyhole-bold-duotone"
                class="text-brand-gold-500 dark:text-[#e5c890]"
                width="1.25rem"
            />
            <p class="text-[0.6875rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                {$t("arabicStudy.node.grammar_pro")}
            </p>
        </div>
    {:else if error || quota}
        <div class="flex flex-col items-center gap-2 py-3 text-center">
            <p
                class="text-[0.6875rem] {quota
                    ? 'text-brand-charcoal-500 dark:text-[#c6d0f5]'
                    : 'text-red-500 dark:text-red-400'}"
            >
                {quota
                    ? $t(quotaMessageKey(quota), {
                          detail: quota.message,
                          time: formatRetryWindow(quota.retryAfterSeconds),
                      })
                    : error}
            </p>
            <button
                onclick={generate}
                class="cursor-pointer rounded-full border border-brand-sand-200 bg-brand-sand-100 px-3 py-1 text-[0.625rem] font-semibold text-brand-charcoal-500 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
            >
                {$t("takehome.try_again")}
            </button>
        </div>
    {:else if !result && loading}
        <div class="flex items-center gap-2 py-4">
            <Icon
                icon="svg-spinners:3-dots-fade"
                class="text-brand-gold-500 dark:text-[#e5c890]"
                width="1.2rem"
            />
            <span class="text-[0.6875rem] text-brand-charcoal-300 dark:text-[#838ba7]">
                {$t("arabicStudy.node.grammar_loading")}
            </span>
        </div>
    {:else if result}
        <div
            class="arabic-study-grammar-md text-[0.75rem] leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]"
        >
            {@html renderMarkdown(result)}
        </div>
        {#if loading}
            <div
                class="mt-2 flex items-center gap-1.5 text-[0.625rem] text-brand-charcoal-300 dark:text-[#838ba7]"
            >
                <Icon icon="svg-spinners:3-dots-fade" width="0.9rem" />
                {$t("takehome.generating")}
            </div>
        {/if}
    {:else}
        <button
            onclick={generate}
            class="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-gold-400 px-3 py-1.5 text-[0.6875rem] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400 dark:hover:text-gray-100"
        >
            <Icon icon="solar:magic-stick-3-bold-duotone" width="0.8rem" />
            {$t("arabicStudy.node.grammar_generate")}
        </button>
    {/if}
</div>

<style>
    .arabic-study-grammar-md :global(p) {
        margin: 0.35em 0;
    }
    .arabic-study-grammar-md :global(p:first-child) {
        margin-top: 0;
    }
    .arabic-study-grammar-md :global(p:last-child) {
        margin-bottom: 0;
    }
    .arabic-study-grammar-md :global(strong) {
        font-weight: 700;
        color: #383a52;
    }
    :global(.dark) .arabic-study-grammar-md :global(strong) {
        color: #eff1f5;
    }
    .arabic-study-grammar-md :global(ul) {
        margin: 0.3em 0;
        padding-left: 1.1em;
    }
    .arabic-study-grammar-md :global(li) {
        margin: 0.2em 0;
    }
</style>
