<!-- Vowel (ḥarakah) pairing practice: pick a consonant, hear/practice all
     four short-vowel combinations, and see how they chain into a real word.
     Body-only, same reasoning as AlphabetLesson (the window's own header
     already exists in ArabicStudyHome). -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import { PAIRING_CONSONANTS, harakahFor } from "$lib/data/arabic-harakat";
    import DictationPractice from "./DictationPractice.svelte";

    interface Props {
        onBack: () => void;
        onDone: () => void;
    }
    let { onBack, onDone }: Props = $props();

    let selectedId = $state("ba");

    const selected = $derived(
        PAIRING_CONSONANTS.find((c) => c.id === selectedId) ?? PAIRING_CONSONANTS[0],
    );
    const harakat = $derived(harakahFor(selected.glyph, selected.rom));
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-[#303446]">
    <div
        class="shrink-0 border-b border-brand-sand-200 bg-brand-sand-50 px-5 py-2.5 text-[0.75rem] leading-relaxed text-brand-charcoal-500 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5]"
    >
        {$t("arabicStudy.pairing.lead", { letter: selected.glyph })}
    </div>

    <div class="default-scroll flex min-h-0 flex-1 gap-5 overflow-y-auto p-5">
        <!-- Consonant picker -->
        <div class="w-40 shrink-0">
            <h4
                class="mb-2 text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
            >
                {$t("arabicStudy.pairing.consonant")}
            </h4>
            <div class="flex flex-col gap-1">
                {#each PAIRING_CONSONANTS as c (c.id)}
                    <button
                        onclick={() => (selectedId = c.id)}
                        class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors {selectedId ===
                        c.id
                            ? 'bg-brand-gold-50 dark:bg-[#e5c890]/10'
                            : 'hover:bg-brand-sand-100 dark:hover:bg-[#292c3c]'}"
                    >
                        <span class="w-6 text-center font-scheherazade text-lg text-brand-charcoal-700 dark:text-[#c6d0f5]">{c.glyph}</span>
                        <span class="text-[0.6875rem] font-semibold text-brand-charcoal-500 dark:text-[#a5adce]">{c.name}</span>
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
                    <span class="mt-1.5 font-scheherazade text-3xl text-brand-charcoal-900 dark:text-[#c6d0f5]">{harakat.fatha}</span>
                    <span class="mt-1 text-[0.75rem] font-bold text-brand-charcoal-500 dark:text-[#a5adce]">{harakat.faSyl}</span>
                </div>
                <div
                    class="flex flex-col items-center rounded-2xl border border-brand-sand-200 bg-brand-sand-50 py-3.5 dark:border-[#414559] dark:bg-[#232634]"
                >
                    <span class="text-[0.5625rem] font-bold uppercase tracking-wide text-brand-gold-500 dark:text-[#e5c890]">{$t("arabicStudy.pairing.kasra")}</span>
                    <span class="mt-1.5 font-scheherazade text-3xl text-brand-charcoal-900 dark:text-[#c6d0f5]">{harakat.kasra}</span>
                    <span class="mt-1 text-[0.75rem] font-bold text-brand-charcoal-500 dark:text-[#a5adce]">{harakat.kaSyl}</span>
                </div>
                <div
                    class="flex flex-col items-center rounded-2xl border border-brand-sand-200 bg-brand-sand-50 py-3.5 dark:border-[#414559] dark:bg-[#232634]"
                >
                    <span class="text-[0.5625rem] font-bold uppercase tracking-wide text-brand-gold-500 dark:text-[#e5c890]">{$t("arabicStudy.pairing.damma")}</span>
                    <span class="mt-1.5 font-scheherazade text-3xl text-brand-charcoal-900 dark:text-[#c6d0f5]">{harakat.damma}</span>
                    <span class="mt-1 text-[0.75rem] font-bold text-brand-charcoal-500 dark:text-[#a5adce]">{harakat.daSyl}</span>
                </div>
                <div
                    class="flex flex-col items-center rounded-2xl border border-brand-sand-200 bg-brand-sand-50 py-3.5 dark:border-[#414559] dark:bg-[#232634]"
                >
                    <span class="text-[0.5625rem] font-bold uppercase tracking-wide text-brand-gold-500 dark:text-[#e5c890]">{$t("arabicStudy.pairing.sukun")}</span>
                    <span class="mt-1.5 font-scheherazade text-3xl text-brand-charcoal-900 dark:text-[#c6d0f5]">{harakat.sukun}</span>
                    <span class="mt-1 text-[0.75rem] font-bold text-brand-charcoal-500 dark:text-[#a5adce]">{harakat.suSyl}</span>
                </div>
            </div>

            <!-- Word-building demo (fixed example, same across consonants) -->
            <div
                class="rounded-2xl border border-[#e6cf96] bg-linear-to-b from-[#fdf6e6] to-white p-4 dark:border-[#6b5b37] dark:from-[#34302a] dark:to-[#292c3c]"
            >
                <div class="text-[0.625rem] font-bold uppercase tracking-wide text-brand-gold-500 dark:text-[#e5c890]">
                    {$t("arabicStudy.pairing.build_word")}
                </div>
                <div class="mt-2.5 flex items-center justify-center gap-3">
                    <div class="text-center">
                        <div dir="rtl" class="font-scheherazade text-2xl text-brand-charcoal-900 dark:text-[#c6d0f5]">بَ</div>
                        <div class="mt-0.5 text-[0.625rem] text-brand-gold-500 dark:text-[#e5c890]">bā + fatḥah</div>
                    </div>
                    <span class="text-brand-gold-300">+</span>
                    <div class="text-center">
                        <div dir="rtl" class="font-scheherazade text-2xl text-brand-charcoal-900 dark:text-[#c6d0f5]">بَيْ</div>
                        <div class="mt-0.5 text-[0.625rem] text-brand-gold-500 dark:text-[#e5c890]">+ yā + sukūn</div>
                    </div>
                    <span class="text-brand-gold-300">+</span>
                    <div class="text-center">
                        <div dir="rtl" class="font-scheherazade text-2xl text-brand-charcoal-900 dark:text-[#c6d0f5]">بَيْت</div>
                        <div class="mt-0.5 text-[0.625rem] text-brand-gold-500 dark:text-[#e5c890]">+ tā</div>
                    </div>
                </div>
                <p class="mt-2.5 text-center text-[0.75rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                    {$t("arabicStudy.pairing.build_result")}
                </p>
            </div>

            <DictationPractice
                target={harakat.fatha}
                label={$t("arabicStudy.dictation.recite_letter", { letter: harakat.fatha })}
            />
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
            {$t("arabicStudy.pairing.back")}
        </button>
        <button
            onclick={onDone}
            class="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-gold-400 px-4 py-1.5 text-[0.75rem] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400"
        >
            {$t("arabicStudy.pairing.done")}
        </button>
    </div>
</div>
