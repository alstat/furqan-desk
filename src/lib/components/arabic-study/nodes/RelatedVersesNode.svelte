<!-- Other ayahs sharing the selected word's root or lemma. Exact match, not
     AI-ranked — see the Rust command's own comment for why. Clicking a result
     re-centers the canvas on that ayah. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { get } from "svelte/store";
    import { t } from "$lib/i18n";
    import { activeTranslatorId } from "$lib/stores/translation.store";
    import { fetchVerseTexts, type VerseText } from "$lib/data/verse-of-day";
    import { findVersesByRootOrLemma } from "$lib/data/arabic-study";
    import { openVerseStudy } from "$lib/stores/arabic-study.store";
    import type { RootLemmaSelection } from "./RootLemmaNode.svelte";

    interface Props {
        selection: RootLemmaSelection | null;
        surah: number;
        ayah: number;
    }
    let { selection, surah, ayah }: Props = $props();

    let loading = $state(false);
    let error = $state("");
    let results = $state<VerseText[]>([]);

    $effect(() => {
        const sel = selection;
        const excludeSurah = surah;
        const excludeAyah = ayah;
        if (!sel || (!sel.root && !sel.lemma)) {
            results = [];
            return;
        }
        let cancelled = false;
        loading = true;
        error = "";
        (async () => {
            try {
                const matches = await findVersesByRootOrLemma(
                    sel.root,
                    sel.lemma,
                    excludeSurah,
                    excludeAyah,
                );
                if (cancelled) return;
                const texts = await fetchVerseTexts(
                    matches.map((m) => ({ surah: m.surah, ayah: m.ayah })),
                    get(activeTranslatorId) ?? undefined,
                );
                if (!cancelled) results = texts;
            } catch (e) {
                if (!cancelled) error = e instanceof Error ? e.message : String(e);
            } finally {
                if (!cancelled) loading = false;
            }
        })();
        return () => {
            cancelled = true;
        };
    });
</script>

<div
    class="rounded-2xl border border-brand-emerald-200 bg-brand-emerald-50 p-3.5 dark:border-[#414559] dark:bg-[#292c3c]"
>
    <div class="mb-1.5 flex items-center gap-2">
        <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-emerald-100 text-brand-emerald-600 dark:bg-[#414559] dark:text-[#9dd4c8]"
        >
            <Icon icon="solar:documents-minimalistic-bold-duotone" width="0.85rem" />
        </span>
        <h3 class="text-[0.71875rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
            {$t("arabicStudy.node.related_verses")}
        </h3>
    </div>
    <p class="mb-2 text-[0.625rem] leading-relaxed text-brand-charcoal-400 dark:text-[#838ba7]">
        {$t("arabicStudy.node.related_verses_disclaimer")}
    </p>

    {#if !selection}
        <p class="py-2 text-[0.6875rem] text-brand-charcoal-300 dark:text-[#838ba7]">
            {$t("arabicStudy.node.related_verses_empty")}
        </p>
    {:else if loading}
        <div class="flex items-center gap-2 py-3 text-brand-charcoal-300 dark:text-[#838ba7]">
            <Icon icon="svg-spinners:3-dots-fade" width="1.1rem" />
        </div>
    {:else if error}
        <p class="py-2 text-[0.6875rem] text-red-500 dark:text-red-400">{error}</p>
    {:else if !results.length}
        <p class="py-2 text-[0.6875rem] text-brand-charcoal-300 dark:text-[#838ba7]">
            {$t("arabicStudy.node.related_verses_none")}
        </p>
    {:else}
        <div class="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
            {#each results as v (`${v.surah}:${v.ayah}`)}
                <button
                    onclick={() => openVerseStudy({ surah: v.surah, ayah: v.ayah })}
                    class="cursor-pointer rounded-xl border border-brand-emerald-200/70 bg-white/70 px-2.5 py-2 text-left transition-colors hover:bg-white dark:border-[#414559] dark:bg-[#1e2030]/60 dark:hover:bg-[#1e2030]"
                >
                    <div class="flex items-center justify-between gap-2">
                        <span
                            dir="rtl"
                            class="truncate font-scheherazade text-base text-brand-charcoal-900 dark:text-[#c6d0f5]"
                        >
                            {v.arabic}
                        </span>
                        <span
                            dir="ltr"
                            class="shrink-0 rounded-full border border-[#ecd9a6] bg-[#f7ebcf] px-2 py-0.5 font-scheherazade text-[0.6875rem] text-[#b07d28]"
                        >
                            ﴾{v.surah}:{v.ayah}﴿
                        </span>
                    </div>
                    {#if v.translation}
                        <p
                            class="mt-1 truncate text-[0.65625rem] text-brand-charcoal-400 dark:text-[#a5adce]"
                        >
                            {v.translation}
                        </p>
                    {/if}
                </button>
            {/each}
        </div>
    {/if}
</div>
