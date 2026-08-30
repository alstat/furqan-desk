<!-- Three-letter word combinations: pick a word, watch it assemble one
     letter at a time, then say the whole thing aloud. The natural next step
     after PairingLesson's consonant+ḥarakah pairing — same body-only
     reasoning as the other lesson pages. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { onMount } from "svelte";
    import { t } from "$lib/i18n";
    import { THREE_LETTER_WORDS } from "$lib/data/three-letter-words";
    import { fetchSurahMorphology } from "$lib/data/arabic-study";
    import { ensureSurahLabels, surahLabels } from "$lib/stores/quran.svelte";
    import { requestPlayDirect } from "$lib/stores/recitation.store";
    import type { SurahMorphology } from "$lib/types/morphology";
    import {
        buildArabicWord,
        transliterateArabicWord,
    } from "$lib/utils/arabic-word-builder";
    import DictationPractice from "./DictationPractice.svelte";
    import VerseRefBadge from "./VerseRefBadge.svelte";

    interface Props {
        onBack: () => void;
        onContinue: () => void;
    }
    let { onBack, onContinue }: Props = $props();

    let selectedId = $state(THREE_LETTER_WORDS[0].id);
    let selectedSurah = $state(1);
    let selectedAyah = $state(1);
    let selectedWordNumber = $state(1);
    let verseMorphology = $state<SurahMorphology | null>(null);
    let verseLoading = $state(false);
    let verseError = $state(false);
    let verseRequestId = 0;

    const selected = $derived(
        THREE_LETTER_WORDS.find((word) => word.id === selectedId) ?? THREE_LETTER_WORDS[0],
    );
    const selectedVerse = $derived(
        verseMorphology?.ayahs.find((ayah) => ayah.ayah === selectedAyah) ?? null,
    );
    const selectedVerseWord = $derived(
        selectedVerse?.words.find((word) => word.word === selectedWordNumber) ??
            selectedVerse?.words[0] ??
            null,
    );
    const selectedBreakdown = $derived(
        selectedVerseWord ? buildArabicWord(selectedVerseWord.combined_arabic) : [],
    );

    async function loadSurah(surah: number) {
        const requestId = ++verseRequestId;
        selectedSurah = surah;
        verseLoading = true;
        verseError = false;
        try {
            const morphology = await fetchSurahMorphology(surah);
            if (requestId !== verseRequestId) return;
            verseMorphology = morphology;
            selectedAyah = morphology.ayahs[0]?.ayah ?? 1;
            selectedWordNumber = morphology.ayahs[0]?.words[0]?.word ?? 1;
        } catch {
            if (requestId !== verseRequestId) return;
            verseMorphology = null;
            verseError = true;
        } finally {
            if (requestId === verseRequestId) verseLoading = false;
        }
    }

    function chooseAyah(ayah: number) {
        selectedAyah = ayah;
        const verse = verseMorphology?.ayahs.find((item) => item.ayah === ayah);
        selectedWordNumber = verse?.words[0]?.word ?? 1;
    }

    function playSelectedVerse() {
        requestPlayDirect.set({ surah: selectedSurah, ayah: selectedAyah });
    }

    onMount(() => {
        void ensureSurahLabels();
        void loadSurah(1);
    });
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-[#303446]">
    <div
        class="shrink-0 border-b border-brand-sand-200 bg-brand-sand-50 px-5 py-2.5 text-[0.75rem] leading-relaxed text-brand-charcoal-500 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5]"
    >
        {$t("arabicStudy.words.lead")}
    </div>

    <div class="default-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3 md:flex-row md:p-5">
        <!-- Word picker -->
        <div class="w-full shrink-0 md:w-48">
            <h4
                class="mb-2 text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
            >
                {$t("arabicStudy.words.picker")}
            </h4>
            <div class="grid grid-cols-2 gap-1 sm:grid-cols-3 md:flex md:flex-col">
                {#each THREE_LETTER_WORDS as word (word.id)}
                    <button
                        onclick={() => (selectedId = word.id)}
                        class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors {selectedId ===
                        word.id
                            ? 'bg-brand-gold-50 dark:bg-[#e5c890]/10'
                            : 'hover:bg-brand-sand-100 dark:hover:bg-[#292c3c]'}"
                    >
                        <span dir="rtl" class="w-12 text-center font-scheherazade text-lg text-brand-charcoal-700 dark:text-[#c6d0f5]">{word.word}</span>
                        <span class="min-w-0 flex-1 truncate text-[0.6875rem] font-semibold text-brand-charcoal-500 dark:text-[#a5adce]">{word.meaning}</span>
                    </button>
                {/each}
            </div>
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-4">
            <!-- Full word, emphasized -->
            <div
                class="flex flex-col items-center gap-3 rounded-2xl border border-brand-sand-200 bg-brand-sand-50 p-4 text-center sm:flex-row sm:gap-5 sm:text-left dark:border-[#414559] dark:bg-[#232634]"
            >
                <div dir="rtl" class="flex h-20 shrink-0 items-center justify-center font-scheherazade text-6xl text-brand-charcoal-900 dark:text-[#c6d0f5]">
                    {selected.word}
                </div>
                <div class="min-w-0">
                    <div class="text-base font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                        {selected.translit} — {selected.meaning}
                    </div>
                    <div class="mt-1">
                        <VerseRefBadge verseRef={selected.ref} />
                    </div>
                </div>
            </div>

            <!-- Progressive letter-by-letter build -->
            <div
                class="rounded-2xl border border-[#e6cf96] bg-linear-to-b from-[#fdf6e6] to-white p-4 dark:border-[#6b5b37] dark:from-[#34302a] dark:to-[#292c3c]"
            >
                <div class="text-[0.625rem] font-bold uppercase tracking-wide text-brand-gold-500 dark:text-[#e5c890]">
                    {$t("arabicStudy.words.building")}
                </div>
                <div class="default-scroll mt-2.5 flex items-center gap-3 overflow-x-auto pb-1 sm:justify-center">
                    {#each selected.steps as step, i (i)}
                        {#if i > 0}
                            <Icon
                                icon="solar:arrow-right-linear"
                                width="0.9rem"
                                class="shrink-0 text-brand-gold-300"
                            />
                        {/if}
                        <div class="text-center">
                            <div dir="rtl" class="pb-3 font-scheherazade text-2xl leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">{step.text}</div>
                            <div class="mt-1 text-[0.625rem] text-brand-gold-500 dark:text-[#e5c890]">
                                {step.caption} = {transliterateArabicWord(step.text)}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>

            <div
                class="rounded-2xl border border-brand-gold-200 bg-brand-gold-50 p-4 dark:border-[#5a5030] dark:bg-[#34302a]"
            >
                <div class="flex items-start gap-3">
                    <Icon
                        icon="solar:book-2-bold-duotone"
                        width="1.1rem"
                        class="mt-0.5 shrink-0 text-brand-gold-500 dark:text-[#e5c890]"
                    />
                    <div class="min-w-0 flex-1">
                        <h3 class="text-[0.8125rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                            {$t("arabicStudy.words.verse_builder_title")}
                        </h3>
                        <p class="mt-0.5 text-[0.6875rem] leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]">
                            {$t("arabicStudy.words.verse_builder_desc")}
                        </p>
                    </div>
                </div>

                <div class="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <label>
                        <span class="mb-1 block text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-400 dark:text-[#838ba7]">
                            {$t("arabicStudy.words.surah")}
                        </span>
                        <select
                            value={selectedSurah}
                            onchange={(event) => void loadSurah(Number(event.currentTarget.value))}
                            class="w-full cursor-pointer rounded-xl border border-brand-gold-200 bg-white px-3 py-2 text-[0.75rem] text-brand-charcoal-600 outline-none focus:border-brand-gold-400 dark:border-[#5a5030] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                        >
                            {#each $surahLabels as label, index (index)}
                                <option value={index + 1}>{index + 1}. {label.en} — {label.ar}</option>
                            {/each}
                        </select>
                    </label>
                    <label>
                        <span class="mb-1 block text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-400 dark:text-[#838ba7]">
                            {$t("arabicStudy.words.ayah")}
                        </span>
                        <select
                            value={selectedAyah}
                            disabled={verseLoading || !verseMorphology}
                            onchange={(event) => chooseAyah(Number(event.currentTarget.value))}
                            class="w-full cursor-pointer rounded-xl border border-brand-gold-200 bg-white px-3 py-2 text-[0.75rem] text-brand-charcoal-600 outline-none focus:border-brand-gold-400 disabled:cursor-wait disabled:opacity-50 dark:border-[#5a5030] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                        >
                            {#each verseMorphology?.ayahs ?? [] as ayah (ayah.ayah)}
                                <option value={ayah.ayah}>{ayah.ayah}</option>
                            {/each}
                        </select>
                    </label>
                </div>

                {#if verseLoading}
                    <div class="flex items-center justify-center gap-2 py-8 text-[0.6875rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                        <Icon icon="svg-spinners:3-dots-fade" width="1.2rem" />
                        {$t("arabicStudy.words.loading_verse")}
                    </div>
                {:else if verseError}
                    <p class="py-6 text-center text-[0.6875rem] text-red-500 dark:text-red-400">
                        {$t("arabicStudy.words.verse_error")}
                    </p>
                {:else if selectedVerse}
                    <div class="mt-3 flex items-stretch gap-2">
                        <div
                            dir="rtl"
                            data-surah={selectedSurah}
                            data-ayah={selectedAyah}
                            class="min-w-0 flex-1 rounded-xl border border-brand-gold-200/70 bg-white px-4 py-3 text-center font-scheherazade text-2xl leading-loose text-brand-charcoal-900 dark:border-[#5a5030] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                        >
                            {selectedVerse.words.map((word) => word.combined_arabic).join(" ")}
                        </div>
                        <button
                            onclick={playSelectedVerse}
                            title={$t("morphology.play_ayah", { ayah: String(selectedAyah) })}
                            aria-label={$t("morphology.play_ayah", { ayah: String(selectedAyah) })}
                            class="flex w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-brand-gold-200 bg-white text-brand-gold-600 transition-colors hover:border-brand-gold-400 hover:bg-brand-gold-100 dark:border-[#5a5030] dark:bg-[#292c3c] dark:text-[#e5c890] dark:hover:border-[#e5c890]/60 dark:hover:bg-[#414559]"
                        >
                            <Icon icon="solar:play-circle-bold-duotone" width="1.5rem" />
                        </button>
                    </div>

                    <p class="mt-3 text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-400 dark:text-[#838ba7]">
                        {$t("arabicStudy.words.choose_word")}
                    </p>
                    <div dir="rtl" class="mt-1.5 flex flex-wrap gap-2">
                        {#each selectedVerse.words as word (word.word)}
                            <button
                                onclick={() => (selectedWordNumber = word.word)}
                                aria-pressed={selectedVerseWord?.word === word.word}
                                class="cursor-pointer rounded-xl border px-3 py-2 text-center transition-colors {selectedVerseWord?.word === word.word
                                    ? 'border-brand-gold-400 bg-brand-gold-100 ring-2 ring-brand-gold-200 dark:border-[#e5c890] dark:bg-[#414559] dark:ring-[#e5c890]/20'
                                    : 'border-brand-sand-200 bg-white hover:border-brand-gold-300 dark:border-[#414559] dark:bg-[#292c3c]'}"
                            >
                                <span class="block pb-2 pt-2 font-scheherazade text-xl text-brand-charcoal-900 dark:text-[#c6d0f5]">{word.combined_arabic}</span>
                                <span dir="ltr" class="mt-0.5 block text-[0.625rem] italic text-brand-charcoal-400 dark:text-[#a5adce]">
                                    {transliterateArabicWord(word.combined_arabic)}
                                </span>
                            </button>
                        {/each}
                    </div>

                    {#if selectedVerseWord}
                        <div class="mt-4 border-t border-brand-gold-200/70 pt-4 dark:border-[#5a5030]">
                            <div class="flex items-center justify-between gap-3">
                                <div>
                                    <div class="text-[0.625rem] font-bold uppercase tracking-wide text-brand-gold-500 dark:text-[#e5c890]">
                                        {$t("arabicStudy.words.build_selected")}
                                    </div>
                                    <div dir="ltr" class="mt-0.5 text-[0.75rem] font-semibold text-brand-charcoal-600 dark:text-[#c6d0f5]">
                                        {transliterateArabicWord(selectedVerseWord.combined_arabic)}
                                    </div>
                                </div>
                                <VerseRefBadge verseRef={`${selectedSurah}:${selectedAyah}`} size="sm" />
                            </div>

                            <div class="default-scroll mt-3 flex gap-2 overflow-x-auto pb-2">
                                {#each selectedBreakdown as unit, index (index)}
                                    {#if index > 0}
                                        <Icon
                                            icon="solar:arrow-right-linear"
                                            width="0.9rem"
                                            class="self-center shrink-0 text-brand-gold-300"
                                        />
                                    {/if}
                                    <div class="min-w-32 flex-1 rounded-xl border border-brand-gold-200/70 bg-white p-2.5 text-center dark:border-[#5a5030] dark:bg-[#292c3c]">
                                        <div class="text-[0.5625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">
                                            {unit.letterName}
                                        </div>
                                        <div dir="rtl" class="mt-1 pb-2 font-scheherazade text-3xl text-brand-gold-600 dark:text-[#e5c890]">
                                            {unit.text}
                                        </div>
                                        <div class="mt-1 text-[0.5625rem] leading-snug text-brand-charcoal-400 dark:text-[#838ba7]">
                                            {unit.markLabel}
                                        </div>
                                        <div class="mt-2 border-t border-brand-sand-200 pt-2 dark:border-[#414559]">
                                            <div dir="rtl" class="pb-2 font-scheherazade text-xl text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                                {unit.cumulativeText}
                                            </div>
                                            <div dir="ltr" class="text-[0.6875rem] font-semibold text-brand-gold-600 dark:text-[#e5c890]">
                                                {unit.cumulativeTransliteration}
                                            </div>
                                        </div>
                                    </div>
                                {/each}
                            </div>

                            {#each selectedBreakdown.filter((unit) => unit.note) as unit (unit.cumulativeText)}
                                <div class="mt-2 flex items-start gap-2 rounded-xl border border-brand-teal-200 bg-brand-teal-50 px-3 py-2 dark:border-[#416067] dark:bg-[#29383e]">
                                    <Icon icon="solar:volume-cross-bold-duotone" width="0.9rem" class="mt-0.5 shrink-0 text-brand-teal-600 dark:text-[#92cccc]" />
                                    <p class="text-[0.6875rem] leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]">
                                        {unit.note} {$t("arabicStudy.words.silent_next")}
                                    </p>
                                </div>
                            {/each}
                        </div>
                    {/if}

                    <p class="mt-3 text-[0.625rem] italic leading-relaxed text-brand-charcoal-400 dark:text-[#838ba7]">
                        {$t("arabicStudy.words.translit_note")}
                    </p>
                    <div class="mt-3 flex items-start gap-2 rounded-xl border border-brand-teal-200 bg-brand-teal-50 px-3 py-2 dark:border-[#416067] dark:bg-[#29383e]">
                        <Icon icon="solar:volume-cross-bold-duotone" width="0.9rem" class="mt-0.5 shrink-0 text-brand-teal-600 dark:text-[#92cccc]" />
                        <p class="text-[0.6875rem] leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]">
                            {$t("arabicStudy.words.silent_intro")} {$t("arabicStudy.words.silent_next")}
                        </p>
                    </div>
                {/if}
            </div>

            {#key selected.id}
                <DictationPractice
                    target={selected.word}
                    label={$t("arabicStudy.dictation.recite_letter", { letter: selected.word })}
                />
            {/key}
            <!-- Spacer — padding-bottom on a scrolling flex container isn't
                 reliably honored by every WebView engine, so a real element
                 guarantees breathing room above the footer once scrolled. -->
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
            {$t("arabicStudy.words.back")}
        </button>
        <button
            onclick={onContinue}
            class="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-gold-400 px-4 py-1.5 text-[0.75rem] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400"
        >
            {$t("arabicStudy.words.continue_forms")}
            <Icon icon="solar:arrow-right-linear" width="0.8rem" />
        </button>
    </div>
</div>
