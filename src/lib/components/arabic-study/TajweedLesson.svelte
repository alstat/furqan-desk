<!-- An introduction to tajwīd: qalqalah, and the four ways a sākin nūn or
     tanwīn behaves. The last stop in the Beginner curriculum — same
     body-only reasoning as the other lesson pages. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import { TAJWEED_RULES } from "$lib/data/tajweed-rules";
    import { highlightLetter } from "$lib/utils/arabic-highlight";
    import AyahRuleExplorer from "./AyahRuleExplorer.svelte";
    import DictationPractice from "./DictationPractice.svelte";
    import VerseRefBadge from "./VerseRefBadge.svelte";

    interface Props {
        onBack: () => void;
        onDone: () => void;
    }
    let { onBack, onDone }: Props = $props();

    let selectedId = $state(TAJWEED_RULES[0].id);
    const selected = $derived(TAJWEED_RULES.find((r) => r.id === selectedId) ?? TAJWEED_RULES[0]);
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-[#303446]">
    <div
        class="shrink-0 border-b border-brand-sand-200 bg-brand-sand-50 px-5 py-2.5 text-[0.75rem] leading-relaxed text-brand-charcoal-500 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5]"
    >
        {$t("arabicStudy.tajweed.lead")}
    </div>

    <div class="default-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3 md:flex-row md:p-5">
        <!-- Rule picker -->
        <div class="w-full shrink-0 md:w-48">
            <h4
                class="mb-2 text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
            >
                {$t("arabicStudy.tajweed.picker")}
            </h4>
            <div class="grid grid-cols-2 gap-1 sm:grid-cols-3 md:flex md:flex-col">
                {#each TAJWEED_RULES as r (r.id)}
                    <button
                        onclick={() => (selectedId = r.id)}
                        class="rounded-xl px-2.5 py-2 text-left transition-colors {selectedId === r.id
                            ? 'bg-brand-gold-50 ring-1 ring-brand-gold-300 dark:bg-[#e5c890]/10 dark:ring-[#e5c890]/40'
                            : 'hover:bg-brand-sand-100 dark:hover:bg-[#292c3c]'}"
                    >
                        <div dir="rtl" class="pb-2 font-scheherazade text-base text-brand-charcoal-900 dark:text-[#c6d0f5]">{r.term}</div>
                        <div class="mt-0.5 text-[0.6875rem] font-semibold leading-snug text-brand-charcoal-500 dark:text-[#a5adce]">
                            {r.label}
                        </div>
                    </button>
                {/each}
            </div>
        </div>

        <!-- Detail panel -->
        <div class="flex min-w-0 flex-1 flex-col gap-4">
            <div
                class="rounded-2xl border border-brand-sand-200 bg-brand-sand-50 p-4 dark:border-[#414559] dark:bg-[#232634]"
            >
                <div class="flex items-baseline gap-2.5">
                    <div dir="rtl" class="font-scheherazade text-2xl text-brand-charcoal-900 dark:text-[#c6d0f5]">
                        {selected.term}
                    </div>
                    <div class="text-[0.75rem] italic text-brand-charcoal-400 dark:text-[#a5adce]">
                        {selected.termTranslit}
                    </div>
                </div>
                <div class="mt-0.5 text-[0.8125rem] font-bold text-brand-charcoal-700 dark:text-[#c6d0f5]">
                    {selected.label}
                </div>
                <p class="mt-2 text-[0.75rem] leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]">
                    {selected.description}
                </p>
            </div>

            <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {#each selected.examples as ex (ex.word)}
                    <div
                        class="rounded-xl border border-brand-sand-200 bg-white p-2.5 dark:border-[#414559] dark:bg-[#292c3c]"
                    >
                        <div dir="rtl" class="pb-2 font-scheherazade text-xl leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">
                            {#each highlightLetter(ex.word, ex.highlightGlyph ?? "") as seg, si (si)}{#if seg.hi}<span class="text-brand-gold-500 dark:text-[#e5c890]">{seg.text}</span>{:else}{seg.text}{/if}{/each}
                        </div>
                        <div dir="ltr" class="mt-0.5 text-left text-[0.625rem]">
                            <span class="italic text-brand-charcoal-400 dark:text-[#a5adce]">{ex.translit}</span>
                            <span class="text-brand-charcoal-300 dark:text-[#5b6078]"> — </span>
                            <span class="font-semibold text-brand-charcoal-600 dark:text-[#c6d0f5]">{ex.meaning}</span>
                        </div>
                        {#if ex.ref}
                            <div class="mt-1">
                                <VerseRefBadge verseRef={ex.ref} size="sm" />
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>

            <AyahRuleExplorer mode="tajweed" />

            <DictationPractice
                target={selected.examples[0].word}
                label={$t("arabicStudy.dictation.recite_letter", { letter: selected.examples[0].word })}
            />
            <div class="h-4 shrink-0" aria-hidden="true"></div>
        </div>
    </div>

    <div
        class="flex shrink-0 items-center justify-between border-t border-brand-sand-200 px-5 py-3 dark:border-[#414559]"
    >
        <button
            onclick={onBack}
            class="flex cursor-pointer items-center gap-1.5 text-[0.75rem] font-semibold text-brand-charcoal-400 hover:text-brand-charcoal-600 dark:text-[#838ba7] dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:arrow-left-linear" width="0.8rem" />
            {$t("arabicStudy.tajweed.back")}
        </button>
        <button
            onclick={onDone}
            class="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-gold-400 px-4 py-1.5 text-[0.75rem] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400"
        >
            {$t("arabicStudy.tajweed.done")}
        </button>
    </div>
</div>
