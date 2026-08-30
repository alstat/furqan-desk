<script lang="ts">
    import Icon from "@iconify/svelte";
    import { onMount, untrack } from "svelte";
    import { fetchSurahMorphology } from "$lib/data/arabic-study";
    import { applyTajweed, firstBaseLetter, TAJWEED_COLORS } from "$lib/functions/utils/tajweed";
    import { t } from "$lib/i18n";
    import { requestPlayDirect } from "$lib/stores/recitation.store";
    import { goToVerse } from "$lib/utils/verse-nav";
    import { ensureSurahLabels, surahLabels } from "$lib/stores/quran.svelte";
    import type { SurahMorphology } from "$lib/types/morphology";
    import { ALIF_FORM_COLORS, highlightAlifForms } from "$lib/utils/alif-form-highlights";

    type ExplorerMode = "tajweed" | "alif";

    interface Props {
        mode: ExplorerMode;
        /** Set by the lesson when a verse chip above is clicked. */
        focusRef?: { surah: number; ayah: number } | null;
    }

    let { mode, focusRef = null }: Props = $props();

    // Same look as SurahWidget's pickers (see its `selectClass`).
    const selectClass =
        "w-full appearance-none cursor-pointer rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-3 py-1.5 pr-8 text-xs text-brand-charcoal-500 dark:text-[#c6d0f5] transition-all focus:border-brand-gold-400 dark:focus:border-[#e5c890] focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20 hover:border-brand-sand-400 dark:hover:border-[#626880] hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]";

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
            const text = chunks.map((chunk) => chunk.text).join("");
            // Character ranges to paint, merging neighbours that share a colour.
            const runs: { start: number; end: number; color: string }[] = [];
            let offset = 0;
            for (const chunk of chunks) {
                const end = offset + chunk.text.length;
                if (chunk.color) {
                    const last = runs[runs.length - 1];
                    if (last && last.end === offset && last.color === chunk.color) {
                        last.end = end;
                    } else {
                        runs.push({ start: offset, end, color: chunk.color });
                    }
                }
                offset = end;
            }
            return { number: word.word, chunks, text, runs };
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

    /**
     * Paints the coloured letters without ever splitting the word's text run.
     * The base span holds the whole word untouched — so the font shapes and
     * joins it exactly as it would uncoloured — and each coloured run is a
     * duplicate of that same word stacked on top, clipped to the run's advance
     * band. Wrapping the letters in coloured spans instead makes WebKit (the
     * WebView this ships in) drop back to isolated forms, and padding those
     * spans with ZWJ re-joins them but leaves the connecting strokes doubled
     * and misaligned, so the coloured letter reads as detached.
     */
    function paintRuns(node: HTMLElement, _runs: { start: number; end: number; color: string }[]) {
        let frame = 0;
        const measure = () => {
            frame = 0;
            const base = node.querySelector<HTMLElement>("[data-base]");
            const text = base?.firstChild;
            if (!base || !text) return;
            const full = base.getBoundingClientRect();
            if (!full.width) return;
            const length = text.textContent?.length ?? 0;
            for (const overlay of node.querySelectorAll<HTMLElement>("[data-run]")) {
                const start = Math.min(Number(overlay.dataset.start), length);
                const end = Math.min(Number(overlay.dataset.end), length);
                if (end <= start) {
                    overlay.style.clipPath = "inset(0 100% 0 0)";
                    continue;
                }
                const range = document.createRange();
                range.setStart(text, start);
                range.setEnd(text, end);
                const band = range.getBoundingClientRect();
                const lead = ((band.left - full.left) / full.width) * 100;
                const trail = ((full.right - band.right) / full.width) * 100;
                // Vertical insets stay negative so tall marks are never clipped.
                overlay.style.clipPath =
                    `inset(-50% ${trail.toFixed(3)}% -50% ${lead.toFixed(3)}%)`;
            }
        };
        // Always measure on a fresh frame. Run inline, this fires mid-update
        // with the previous word still in the DOM, and an offset past the end
        // of that shorter text throws IndexSizeError — aborting the rest of
        // Svelte's flush, which is what left the old verse's word stranded
        // under the new verse's overlays.
        const schedule = () => {
            if (frame) return;
            frame = requestAnimationFrame(measure);
        };
        const observer = new ResizeObserver(schedule);
        observer.observe(node);
        void document.fonts?.ready.then(schedule);
        return {
            update: schedule,
            destroy: () => {
                if (frame) cancelAnimationFrame(frame);
                observer.disconnect();
            },
        };
    }

    /** Follow the lesson's verse chips: load their surah, land on their ayah. */
    async function showVerse(surah: number, ayah: number) {
        if (surah !== selectedSurah || !morphology) {
            await loadSurah(surah);
        }
        if (morphology?.ayahs.some((item) => item.ayah === ayah)) selectedAyah = ayah;
    }

    // Track the object the lesson handed over, not its values: a repeat click
    // on the same chip is a fresh object and re-applies, while the loads
    // `showVerse` itself triggers stay out of this effect's dependencies.
    let appliedFocus: { surah: number; ayah: number } | null = null;
    $effect(() => {
        const ref = focusRef;
        if (!ref || ref === appliedFocus) return;
        appliedFocus = ref;
        untrack(() => void showVerse(ref.surah, ref.ayah));
    });

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
            <div class="relative">
                <select
                    value={selectedSurah}
                    onchange={(event) => void loadSurah(Number(event.currentTarget.value))}
                    class={selectClass}
                >
                    {#each $surahLabels as label, index (index)}
                        <option value={index + 1}>{index + 1}. {label.en} — {label.ar}</option>
                    {/each}
                </select>
                <span
                    class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                >
                    <Icon icon="charm:chevron-down" width="0.75rem" />
                </span>
            </div>
        </label>
        <label>
            <span class="mb-1 block text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-400 dark:text-[#838ba7]">
                {$t("arabicStudy.words.ayah")}
            </span>
            <div class="relative">
                <select
                    value={selectedAyah}
                    disabled={loading || !morphology}
                    onchange={(event) => (selectedAyah = Number(event.currentTarget.value))}
                    class="{selectClass} disabled:cursor-wait disabled:opacity-50"
                >
                    {#each morphology?.ayahs ?? [] as ayah (ayah.ayah)}
                        <option value={ayah.ayah}>{ayah.ayah}</option>
                    {/each}
                </select>
                <span
                    class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                >
                    <Icon icon="charm:chevron-down" width="0.75rem" />
                </span>
            </div>
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
                    {#each highlightedWords as word (word.number)}<span
                            class="relative inline-block"
                            use:paintRuns={word.runs}
                        ><span data-base>{word.text}</span>{#each word.runs as run (run.start)}<span
                                data-run
                                data-start={run.start}
                                data-end={run.end}
                                aria-hidden="true"
                                class="pointer-events-none absolute inset-0"
                                style:color={run.color}>{word.text}</span
                            >{/each}</span
                        >{" "}{/each}
                </div>
                <div class="flex shrink-0 flex-col gap-2">
                    <button
                        onclick={playSelectedVerse}
                        title={$t("morphology.play_ayah", { ayah: String(selectedAyah) })}
                        aria-label={$t("morphology.play_ayah", { ayah: String(selectedAyah) })}
                        class="flex w-12 flex-1 cursor-pointer items-center justify-center rounded-xl border border-brand-gold-200 bg-white text-brand-gold-600 transition-colors hover:border-brand-gold-400 hover:bg-brand-gold-100 dark:border-[#5a5030] dark:bg-[#292c3c] dark:text-[#e5c890] dark:hover:border-[#e5c890]/60 dark:hover:bg-[#414559]"
                    >
                        <Icon icon="solar:play-circle-bold-duotone" width="1.5rem" />
                    </button>
                    <button
                        onclick={() => goToVerse(`${selectedSurah}:${selectedAyah}`)}
                        title={$t("arabicStudy.explorer.open_in_reader", {
                            ref: `${selectedSurah}:${selectedAyah}`,
                        })}
                        aria-label={$t("arabicStudy.explorer.open_in_reader", {
                            ref: `${selectedSurah}:${selectedAyah}`,
                        })}
                        class="flex w-12 flex-1 cursor-pointer items-center justify-center rounded-xl border border-brand-gold-200 bg-white text-brand-gold-600 transition-colors hover:border-brand-gold-400 hover:bg-brand-gold-100 dark:border-[#5a5030] dark:bg-[#292c3c] dark:text-[#e5c890] dark:hover:border-[#e5c890]/60 dark:hover:bg-[#414559]"
                    >
                        <Icon icon="solar:square-top-down-bold-duotone" width="1.4rem" />
                    </button>
                </div>
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
