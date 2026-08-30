<script lang="ts">
    import Icon from "@iconify/svelte";
    import { onMount } from "svelte";
    import { fetchSurahMorphology } from "$lib/data/arabic-study";
    import { applyTajweed, firstBaseLetter, TAJWEED_COLORS } from "$lib/functions/utils/tajweed";
    import { t } from "$lib/i18n";
    import { requestPlayDirect } from "$lib/stores/recitation.store";
    import { ensureSurahLabels, surahLabels } from "$lib/stores/quran.svelte";
    import type { SurahMorphology } from "$lib/types/morphology";
    import { ALIF_FORM_COLORS, highlightAlifForms } from "$lib/utils/alif-form-highlights";

    type ExplorerMode = "tajweed" | "alif";

    interface Props {
        mode: ExplorerMode;
    }

    let { mode }: Props = $props();

    let selectedSurah = $state(1);
    let selectedAyah = $state(1);
    let morphology = $state<SurahMorphology | null>(null);
    let loading = $state(false);
    let loadError = $state(false);
    let requestId = 0;

    const selectedVerse = $derived(
        morphology?.ayahs.find((ayah) => ayah.ayah === selectedAyah) ?? null,
    );
    const highlightedWords = $derived.by(() => {
        if (!selectedVerse) return [];
        return selectedVerse.words.map((word, index) => {
            const nextWord = selectedVerse.words[index + 1]?.combined_arabic ?? "";
            const chunks = mode === "tajweed"
                ? applyTajweed(word.combined_arabic, firstBaseLetter(nextWord))
                : highlightAlifForms(word.combined_arabic);
            return {
                number: word.word,
                chunks,
                text: chunks.map((chunk) => chunk.text).join(""),
                color: chunks.find((chunk) => chunk.color)?.color ?? null,
            };
        });
    });
    const legend = $derived(mode === "tajweed" ? [
        { label: "arabicStudy.explorer.legend_ghunnah", color: TAJWEED_COLORS.ghunnah },
        { label: "arabicStudy.explorer.legend_qalqalah", color: TAJWEED_COLORS.qalqalah },
        { label: "arabicStudy.explorer.legend_ikhfa", color: TAJWEED_COLORS.ikhfa },
        { label: "arabicStudy.explorer.legend_idgham_no_ghunnah", color: TAJWEED_COLORS.idgham_no_ghunnah },
        { label: "arabicStudy.explorer.legend_iqlab", color: TAJWEED_COLORS.iqlab },
        { label: "arabicStudy.explorer.legend_izhar", color: TAJWEED_COLORS.izhar },
        { label: "arabicStudy.explorer.legend_madd", color: TAJWEED_COLORS.madd },
        { label: "arabicStudy.explorer.legend_lam_jalalah", color: TAJWEED_COLORS.lam_jalalah },
    ] : [
        { label: "arabicStudy.explorer.legend_long_aa", color: ALIF_FORM_COLORS.longAa },
        { label: "arabicStudy.explorer.legend_long_uu", color: ALIF_FORM_COLORS.longUu },
        { label: "arabicStudy.explorer.legend_long_ii", color: ALIF_FORM_COLORS.longIi },
        { label: "arabicStudy.explorer.legend_maqsurah", color: ALIF_FORM_COLORS.maqsurah },
        { label: "arabicStudy.explorer.legend_dagger_alif", color: ALIF_FORM_COLORS.daggerAlif },
        { label: "arabicStudy.explorer.legend_hamzat_qat", color: ALIF_FORM_COLORS.hamzatQat },
        { label: "arabicStudy.explorer.legend_alif_wasl", color: ALIF_FORM_COLORS.alifWasl },
    ]);

    async function loadSurah(surah: number) {
        const currentRequest = ++requestId;
        selectedSurah = surah;
        loading = true;
        loadError = false;
        try {
            const result = await fetchSurahMorphology(surah);
            if (currentRequest !== requestId) return;
            morphology = result;
            selectedAyah = result.ayahs[0]?.ayah ?? 1;
        } catch {
            if (currentRequest !== requestId) return;
            morphology = null;
            loadError = true;
        } finally {
            if (currentRequest === requestId) loading = false;
        }
    }

    function playSelectedVerse() {
        requestPlayDirect.set({ surah: selectedSurah, ayah: selectedAyah });
    }

    onMount(() => {
        void ensureSurahLabels();
        void loadSurah(1);
    });
</script>

<section
    class="rounded-2xl border border-brand-gold-200 bg-brand-gold-50 p-3.5 dark:border-[#5a5030] dark:bg-[#34302a]"
>
    <div class="flex items-start gap-3">
        <Icon
            icon={mode === "tajweed" ? "solar:palette-bold-duotone" : "solar:book-2-bold-duotone"}
            width="1.1rem"
            class="mt-0.5 shrink-0 text-brand-gold-500 dark:text-[#e5c890]"
        />
        <div class="min-w-0">
            <h3 class="text-[0.8125rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                {$t(mode === "tajweed" ? "arabicStudy.explorer.tajweed_title" : "arabicStudy.explorer.alif_title")}
            </h3>
            <p class="mt-0.5 text-[0.6875rem] leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]">
                {$t(mode === "tajweed" ? "arabicStudy.explorer.tajweed_desc" : "arabicStudy.explorer.alif_desc")}
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
                disabled={loading || !morphology}
                onchange={(event) => (selectedAyah = Number(event.currentTarget.value))}
                class="w-full cursor-pointer rounded-xl border border-brand-gold-200 bg-white px-3 py-2 text-[0.75rem] text-brand-charcoal-600 outline-none focus:border-brand-gold-400 disabled:cursor-wait disabled:opacity-50 dark:border-[#5a5030] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
            >
                {#each morphology?.ayahs ?? [] as ayah (ayah.ayah)}
                    <option value={ayah.ayah}>{ayah.ayah}</option>
                {/each}
            </select>
        </label>
    </div>

    <div aria-live="polite">
        {#if loading}
            <div class="flex items-center justify-center gap-2 py-8 text-[0.6875rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                <Icon icon="svg-spinners:3-dots-fade" width="1.2rem" />
                {$t("arabicStudy.words.loading_verse")}
            </div>
        {:else if loadError}
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
                    {#each highlightedWords as word (word.number)}
                        <span style:color={word.color}>{word.text}</span>{" "}
                    {/each}
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
        {/if}
    </div>

    <div class="mt-3 border-t border-brand-gold-200/70 pt-3 dark:border-[#5a5030]">
        <div class="text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-400 dark:text-[#838ba7]">
            {$t("arabicStudy.explorer.color_key")}
        </div>
        <div class="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {#each legend as item (item.label)}
                <div class="flex items-center gap-1.5 text-[0.625rem] text-brand-charcoal-500 dark:text-[#a5adce]">
                    <span class="h-2.5 w-2.5 shrink-0 rounded-full" style:background-color={item.color}></span>
                    {$t(item.label)}
                </div>
            {/each}
        </div>
    </div>
</section>
