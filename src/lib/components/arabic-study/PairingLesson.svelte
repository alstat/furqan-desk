<!-- Vowel (ḥarakah) pairing practice: pick a consonant, hear/practice all
     four short-vowel combinations, and see how they chain into a real word.
     Body-only, same reasoning as AlphabetLesson (the window's own header
     already exists in ArabicStudyHome). -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import {
        glossOverrides,
        glossText,
        registerGlosses,
    } from "$lib/stores/arabic-study-gloss.store";
    import {
        PAIRING_CONSONANTS,
        HARAKAT_LEGEND,
        LONG_VOWEL_LETTER_IDS,
        harakahFor,
    } from "$lib/data/arabic-harakat";
    import { getLetterExamples, type WordExample } from "$lib/data/letter-examples";
    import { LETTER_HARAKAH_EXAMPLES } from "$lib/data/letter-harakah-examples";
    import { highlightLetter } from "$lib/utils/arabic-highlight";
    import VerseRefBadge from "./VerseRefBadge.svelte";

    interface Props {
        onBack: () => void;
        onContinue: () => void;
    }
    let { onBack, onContinue }: Props = $props();

    let selectedId = $state("ba");

    const selected = $derived(
        PAIRING_CONSONANTS.find((c) => c.id === selectedId) ?? PAIRING_CONSONANTS[0],
    );
    const harakat = $derived(harakahFor(selected.glyph, selected.rom));
    const isLongVowelLetter = $derived(LONG_VOWEL_LETTER_IDS.includes(selected.id));
    const examples = $derived(getLetterExamples(selected.id));
    const quranExamples = $derived(examples.quran);
    const everydayExamples = $derived(examples.everyday);

    interface HarakahEntry {
        key: "fatha" | "kasra" | "damma" | "sukun";
        labelKey: string;
        example: WordExample;
    }
    const harakahEntries = $derived<HarakahEntry[]>(
        (() => {
            const h = LETTER_HARAKAH_EXAMPLES[selected.id];
            if (!h) return [];
            return [
                { key: "fatha", labelKey: "arabicStudy.pairing.fatha", example: h.fatha },
                { key: "kasra", labelKey: "arabicStudy.pairing.kasra", example: h.kasra },
                { key: "damma", labelKey: "arabicStudy.pairing.damma", example: h.damma },
                { key: "sukun", labelKey: "arabicStudy.pairing.sukun", example: h.sukun },
            ];
        })(),
    );
    $effect(() => {
        registerGlosses([
            ...quranExamples,
            ...everydayExamples,
            ...harakahEntries.map((entry) => entry.example),
        ]);
    });
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-[#303446]">
    <div
        class="shrink-0 border-b border-brand-sand-200 bg-brand-sand-50 px-5 py-2.5 text-[0.75rem] leading-relaxed text-brand-charcoal-500 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5]"
    >
        {$t("arabicStudy.pairing.lead", { letter: selected.glyph })}
    </div>

    <div class="default-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <!-- Vowel diacritics, detached from any specific consonant -->
        <div
            class="shrink-0 rounded-2xl border border-brand-gold-200 bg-brand-gold-50 p-4 dark:border-[#5a5030] dark:bg-[#34302a]"
        >
            <div class="flex items-center gap-1.5">
                <Icon
                    icon="solar:text-italic-square-bold-duotone"
                    width="1rem"
                    class="shrink-0 text-brand-gold-500 dark:text-[#e5c890]"
                />
                <h4 class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                    {$t("arabicStudy.pairing.diacritics_title")}
                </h4>
            </div>
            <p class="mt-1 text-[0.6875rem] leading-relaxed text-brand-gold-700 dark:text-[#e5c890]">
                {$t("arabicStudy.pairing.diacritics_desc")}
            </p>
            <div class="mt-3 grid grid-cols-4 gap-2">
                {#each HARAKAT_LEGEND as h (h.id)}
                    <div
                        class="rounded-xl border border-brand-gold-200/70 bg-white p-2.5 text-center dark:border-[#5a5030] dark:bg-[#292c3c]"
                    >
                        <span class="text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">{$t(h.nameKey)}</span>
                        <div class="mt-1 pb-2 font-scheherazade text-2xl text-brand-charcoal-900 dark:text-[#c6d0f5]">{h.mark}</div>
                        <p class="mt-1 text-[0.625rem] leading-snug text-brand-charcoal-400 dark:text-[#a5adce]">{$t(h.descKey)}</p>
                    </div>
                {/each}
            </div>
        </div>

        <div class="flex shrink-0 gap-5">
            <!-- Consonant picker -->
            <div class="w-52 shrink-0">
                <h4
                    class="mb-2 text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    {$t("arabicStudy.pairing.consonant")}
                </h4>
                <div class="grid grid-cols-5 gap-1.5">
                    {#each PAIRING_CONSONANTS as c (c.id)}
                        <button
                            onclick={() => (selectedId = c.id)}
                            title={c.name}
                            class="relative flex h-10 items-center justify-center rounded-lg font-scheherazade text-xl transition-colors {selectedId ===
                            c.id
                                ? 'bg-brand-gold-100 text-brand-charcoal-900 ring-2 ring-brand-gold-400 dark:bg-[#414559] dark:text-[#c6d0f5] dark:ring-[#e5c890]'
                                : 'bg-brand-sand-100 text-brand-charcoal-500 hover:bg-brand-sand-200 dark:bg-[#292c3c] dark:text-[#c6d0f5] dark:hover:bg-[#363a4f]'}"
                        >
                            {c.glyph}
                        </button>
                    {/each}
                </div>
            </div>

            <div class="flex min-w-0 flex-1 flex-col gap-4">
                <!-- Harakah tiles -->
                <div class="grid grid-cols-4 gap-3">
                    <div
                        class="flex flex-col items-center rounded-2xl border border-brand-sand-200 bg-brand-sand-50 py-3.5 dark:border-[#414559] dark:bg-[#232634]"
                    >
                        <span class="text-[0.5625rem] font-bold uppercase tracking-wide text-brand-gold-500 dark:text-[#e5c890]">{$t("arabicStudy.pairing.fatha")}</span>
                        <span class="mt-1.5 pb-2 font-scheherazade text-3xl text-brand-charcoal-900 dark:text-[#c6d0f5]">{harakat.fatha}</span>
                        <span class="mt-1 text-[0.75rem] font-bold text-brand-charcoal-500 dark:text-[#a5adce]">{harakat.faSyl}</span>
                    </div>
                    <div
                        class="flex flex-col items-center rounded-2xl border border-brand-sand-200 bg-brand-sand-50 py-3.5 dark:border-[#414559] dark:bg-[#232634]"
                    >
                        <span class="text-[0.5625rem] font-bold uppercase tracking-wide text-brand-gold-500 dark:text-[#e5c890]">{$t("arabicStudy.pairing.kasra")}</span>
                        <span class="mt-1.5 pb-2 font-scheherazade text-3xl text-brand-charcoal-900 dark:text-[#c6d0f5]">{harakat.kasra}</span>
                        <span class="mt-1 text-[0.75rem] font-bold text-brand-charcoal-500 dark:text-[#a5adce]">{harakat.kaSyl}</span>
                    </div>
                    <div
                        class="flex flex-col items-center rounded-2xl border border-brand-sand-200 bg-brand-sand-50 py-3.5 dark:border-[#414559] dark:bg-[#232634]"
                    >
                        <span class="text-[0.5625rem] font-bold uppercase tracking-wide text-brand-gold-500 dark:text-[#e5c890]">{$t("arabicStudy.pairing.damma")}</span>
                        <span class="mt-1.5 pb-2 font-scheherazade text-3xl text-brand-charcoal-900 dark:text-[#c6d0f5]">{harakat.damma}</span>
                        <span class="mt-1 text-[0.75rem] font-bold text-brand-charcoal-500 dark:text-[#a5adce]">{harakat.daSyl}</span>
                    </div>
                    <div
                        class="flex flex-col items-center rounded-2xl border border-brand-sand-200 bg-brand-sand-50 py-3.5 dark:border-[#414559] dark:bg-[#232634]"
                    >
                        <span class="text-[0.5625rem] font-bold uppercase tracking-wide text-brand-gold-500 dark:text-[#e5c890]">{$t("arabicStudy.pairing.sukun")}</span>
                        <span class="mt-1.5 pb-2 font-scheherazade text-3xl text-brand-charcoal-900 dark:text-[#c6d0f5]">{harakat.sukun}</span>
                        <span class="mt-1 text-[0.75rem] font-bold text-brand-charcoal-500 dark:text-[#a5adce]">{harakat.suSyl}</span>
                    </div>
                </div>

                {#if isLongVowelLetter}
                    <p
                        class="rounded-xl border border-brand-gold-200 bg-brand-gold-50 px-3 py-2 text-[0.6875rem] leading-relaxed text-brand-gold-600 dark:border-[#5a5030] dark:bg-[#34302a] dark:text-[#e5c890]"
                    >
                        {$t("arabicStudy.pairing.long_vowel_note", { name: selected.name })}
                    </p>
                {/if}

                <!-- Every pairing, spotted in a real word -->
                {#if harakahEntries.length > 0}
                    <div>
                        <h4
                            class="text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
                        >
                            {$t("arabicStudy.pairing.spot_title")}
                        </h4>
                        <div class="mt-1.5 grid grid-cols-4 gap-2">
                            {#each harakahEntries as entry (entry.key)}
                                {@const ex = entry.example}
                                <div
                                    class="rounded-xl border border-brand-sand-200 bg-white p-2.5 dark:border-[#414559] dark:bg-[#292c3c]"
                                >
                                    <span class="text-[0.59375rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">{$t(entry.labelKey)}</span>
                                    <div dir="rtl" class="mt-1 pb-2 font-scheherazade text-xl leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">{#each highlightLetter(ex.word, selected.glyph) as seg, si (si)}{#if seg.hi}<span class="text-brand-gold-500 dark:text-[#e5c890]">{seg.text}</span>{:else}{seg.text}{/if}{/each}</div>
                                    <div dir="ltr" class="mt-0.5 text-left text-[0.625rem]">
                                        <span class="italic text-brand-charcoal-400 dark:text-[#a5adce]">{ex.translit}</span>
                                        <span class="text-brand-charcoal-300 dark:text-[#5b6078]"> — </span>
                                        <span class="font-semibold text-brand-charcoal-600 dark:text-[#c6d0f5]">{glossText(ex.word, ex.meaning, $glossOverrides)}</span>{#if ex.ref}<span class="ml-1.5 align-middle"><VerseRefBadge verseRef={ex.ref} size="sm" /></span>{/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- Examples -->
                <div class="flex gap-3">
                    <div
                        class="flex-1 rounded-2xl border border-brand-emerald-200 bg-brand-emerald-50 p-3 dark:border-[#414559] dark:bg-[#292c3c]"
                    >
                        <span
                            class="rounded-full bg-brand-emerald-100 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-brand-emerald-600 dark:bg-[#414559] dark:text-[#9dd4c8]"
                        >
                            {$t("arabicStudy.alphabet.from_quran")}
                        </span>
                        <div class="mt-2 flex flex-col gap-3">
                            {#each quranExamples as q, i (q.word)}
                                <div class="{i > 0 ? 'border-t border-brand-emerald-200/60 pt-3 dark:border-[#414559]' : ''}">
                                    <div dir="rtl" class="pb-2 font-scheherazade text-2xl leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">{#each highlightLetter(q.word, selected.glyph) as seg, si (si)}{#if seg.hi}<span class="text-brand-gold-500 dark:text-[#e5c890]">{seg.text}</span>{:else}{seg.text}{/if}{/each}</div>
                                    <div dir="ltr" class="mt-0.5 text-left text-[0.6875rem]">
                                        <span class="italic text-brand-charcoal-400 dark:text-[#a5adce]">{q.translit}</span>
                                        <span class="text-brand-charcoal-300 dark:text-[#5b6078]"> — </span>
                                        <span class="font-semibold text-brand-charcoal-600 dark:text-[#c6d0f5]">{glossText(q.word, q.meaning, $glossOverrides)}</span>{#if q.ref}<span class="ml-1.5 align-middle"><VerseRefBadge verseRef={q.ref} /></span>{/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                    <div
                        class="flex-1 rounded-2xl border border-brand-teal-200 bg-brand-teal-50 p-3 dark:border-[#414559] dark:bg-[#292c3c]"
                    >
                        <span
                            class="rounded-full bg-brand-teal-100 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-brand-teal-600 dark:bg-[#414559] dark:text-[#92cccc]"
                        >
                            {$t("arabicStudy.alphabet.everyday")}
                        </span>
                        <div class="mt-2 flex flex-col gap-3">
                            {#each everydayExamples as w, i (w.word)}
                                <div class="{i > 0 ? 'border-t border-brand-teal-200/60 pt-3 dark:border-[#414559]' : ''}">
                                    <div dir="rtl" class="pb-2 font-scheherazade text-2xl leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">{#each highlightLetter(w.word, selected.glyph) as seg, si (si)}{#if seg.hi}<span class="text-brand-gold-500 dark:text-[#e5c890]">{seg.text}</span>{:else}{seg.text}{/if}{/each}</div>
                                    <div dir="ltr" class="mt-0.5 text-left text-[0.6875rem]">
                                        <span class="italic text-brand-charcoal-400 dark:text-[#a5adce]">{w.translit}</span>
                                        <span class="text-brand-charcoal-300 dark:text-[#5b6078]"> — </span>
                                        <span class="font-semibold text-brand-charcoal-600 dark:text-[#c6d0f5]">{glossText(w.word, w.meaning, $glossOverrides)}</span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <!-- Spacer — padding-bottom on a scrolling flex container isn't
             reliably honored by every WebView engine, so a real element
             guarantees breathing room above the footer once scrolled. -->
        <div class="h-2 shrink-0" aria-hidden="true"></div>
    </div>

    <div
        class="flex shrink-0 items-center justify-between border-t border-brand-sand-200 px-5 py-3 dark:border-[#414559]"
    >
        <button
            onclick={onBack}
            class="flex cursor-pointer items-center gap-1.5 text-[0.75rem] font-semibold text-brand-charcoal-400 hover:text-brand-charcoal-600 dark:text-[#838ba7] dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:arrow-left-linear" width="0.8rem" />
            {$t("arabicStudy.pairing.back")}
        </button>
        <button
            onclick={onContinue}
            class="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-gold-400 px-4 py-1.5 text-[0.75rem] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400"
        >
            {$t("arabicStudy.pairing.continue_words")}
            <Icon icon="solar:arrow-right-linear" width="0.8rem" />
        </button>
    </div>
</div>
