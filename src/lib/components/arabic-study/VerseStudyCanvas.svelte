<!-- The Verse Study canvas — opened from the toolbar's Arabic Study button
     (via the per-ayah "Study" action in Morphology View). Centers one ayah
     and surrounds it with Morphology, Root & Lemma, Related Verses, Grammar
     and Ask-AI cards. Window chrome copied from ManuscriptViewer.svelte so it
     reads as the same kind of document window.

     A real, resizable app window can't safely use the fixed pixel-position
     hub-and-spoke layout a static design mockup can — instead the ayah card
     sits prominently on top and the five cards flow in a responsive grid
     below it, which keeps the "everything radiates from this ayah" feel
     without breaking on resize. -->
<script lang="ts">
    import { get } from "svelte/store";
    import { fly } from "svelte/transition";
    import Icon from "@iconify/svelte";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import WindowControls from "$lib/components/shared/WindowControls.svelte";
    import { t } from "$lib/i18n";
    import { surahLabels } from "$lib/stores/quran.svelte";
    import { getSurahNameTashkeel } from "$lib/data/surah-names-tashkeel";
    import { fetchVerseTexts, type VerseText } from "$lib/data/verse-of-day";
    import { fetchAyahMorphology } from "$lib/data/arabic-study";
    import { activeTranslatorId } from "$lib/stores/translation.store";
    import { verseStudyAyah } from "$lib/stores/arabic-study.store";
    import type { AyahMorphology } from "$lib/types/morphology";
    import MorphologyNode from "./nodes/MorphologyNode.svelte";
    import RootLemmaNode, { type RootLemmaSelection } from "./nodes/RootLemmaNode.svelte";
    import RelatedVersesNode from "./nodes/RelatedVersesNode.svelte";
    import GrammarNode from "./nodes/GrammarNode.svelte";
    import AskAiNode from "./nodes/AskAiNode.svelte";

    interface Props {
        open: boolean;
        onClose: () => void;
        /** Same meaning as ManuscriptViewer's — a native window of its own vs a floating in-app panel. */
        standalone?: boolean;
    }
    let { open, onClose, standalone = false }: Props = $props();

    const isMac =
        typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

    let zIndex = $state(500);

    let morphology = $state<AyahMorphology | null>(null);
    let verseText = $state<VerseText | null>(null);
    let loading = $state(false);
    let error = $state("");
    let selection = $state<RootLemmaSelection | null>(null);

    function surahName(n: number): string {
        return get(surahLabels)[n - 1]?.en || getSurahNameTashkeel(n) || `Surah ${n}`;
    }

    async function loadAyah(surah: number, ayah: number) {
        loading = true;
        error = "";
        selection = null;
        try {
            const [morph, texts] = await Promise.all([
                fetchAyahMorphology(surah, ayah),
                fetchVerseTexts([{ surah, ayah }], get(activeTranslatorId) ?? undefined),
            ]);
            morphology = morph;
            verseText = texts[0] ?? null;
            // Default the Related Verses search to the first content word that
            // has a root, so the canvas isn't empty on first open.
            for (const w of morph.words) {
                const hit = w.tokens.find((tok) => tok.features.root || tok.features.lemma);
                if (hit) {
                    selection = {
                        root: hit.features.root,
                        lemma: hit.features.lemma,
                        arabic: hit.form_arabic,
                    };
                    break;
                }
            }
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        const ref = $verseStudyAyah;
        if (open && ref) void loadAyah(ref.surah, ref.ayah);
    });

    $effect(() => {
        if (open) zIndex = bringToFront();
    });

    const grammarContext = $derived(
        $verseStudyAyah && verseText
            ? `${surahName($verseStudyAyah.surah)} (${$verseStudyAyah.surah}), ayah ${$verseStudyAyah.ayah}: ${verseText.arabic}`
            : "",
    );
</script>

{#if open}
    <div
        transition:fly={standalone ? { duration: 0 } : { y: 8, duration: 180, opacity: 0 }}
        class="flex flex-col overflow-hidden bg-white dark:bg-[#303446] {standalone
            ? 'h-full w-full'
            : 'fixed left-1/2 top-1/2 h-[85vh] w-[min(94vw,900px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-brand-sand-200 shadow-xl dark:border-[#414559] dark:shadow-black/40'}"
        style={standalone ? "" : `z-index:${zIndex};`}
        onpointerdown={() => {
            if (!standalone) zIndex = bringToFront();
        }}
    >
        <!-- Header -->
        <div
            data-tauri-drag-region={standalone ? true : undefined}
            class="flex shrink-0 select-none items-center justify-between gap-2 border-b border-brand-gold-200 bg-brand-gold-100 px-4 py-1.5 dark:border-[#414559] dark:bg-[#292c3c]"
            style:padding-left={standalone && isMac ? "5rem" : undefined}
        >
            <div class="flex items-center gap-2" data-tauri-drag-region={standalone ? true : undefined}>
                <Icon
                    icon="solar:square-academic-cap-2-bold-duotone"
                    width="1.1rem"
                    class="text-brand-gold-500"
                />
                <span
                    class="py-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-charcoal-500 dark:text-[#838ba7]"
                >
                    {$verseStudyAyah
                        ? $t("arabicStudy.canvas.title_ayah", {
                              surah: String($verseStudyAyah.surah),
                              ayah: String($verseStudyAyah.ayah),
                          })
                        : $t("arabicStudy.open")}
                </span>
            </div>
            <div class="ml-auto flex items-center gap-1">
                {#if !standalone}
                    <button
                        onclick={onClose}
                        class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg bg-brand-gold-200 text-brand-gold-600 transition-colors hover:bg-brand-gold-200/80 dark:bg-[#414559] dark:text-[#c6d0f5] dark:hover:bg-[#51576d]"
                        aria-label={$t("common.close")}
                    >
                        <Icon icon="solar:close-circle-bold-duotone" width="0.85rem" />
                    </button>
                {/if}
            </div>
            {#if standalone && !isMac}
                <div class="-my-1.5 -mr-2 flex self-stretch">
                    <WindowControls />
                </div>
            {/if}
        </div>

        <!-- Body: a dotted whiteboard-style canvas so the ayah reads as the
             hub of a mind map, with its five cards arranged around it. -->
        <div class="hub-canvas default-scroll min-h-0 flex-1 overflow-y-auto px-6 py-8">
            {#if loading && !morphology}
                <div class="flex flex-col items-center gap-3 py-16 text-center">
                    <Icon
                        icon="svg-spinners:3-dots-fade"
                        class="text-brand-gold-500 dark:text-[#e5c890]"
                        width="1.6rem"
                    />
                </div>
            {:else if error}
                <div class="flex flex-col items-center gap-2 py-16 text-center">
                    <Icon
                        icon="solar:danger-triangle-bold-duotone"
                        class="text-red-400"
                        width="1.5rem"
                    />
                    <p class="text-xs text-red-500 dark:text-red-400">{error}</p>
                </div>
            {:else if morphology && $verseStudyAyah}
                <div class="hub-grid mx-auto max-w-4xl">
                    <div class="area-morph">
                        <MorphologyNode words={morphology.words} />
                    </div>
                    <div class="area-root">
                        <RootLemmaNode
                            words={morphology.words}
                            {selection}
                            onSelect={(sel) => (selection = sel)}
                        />
                    </div>

                    <!-- Hub: the ayah itself -->
                    <div class="area-ayah hub-center">
                        <div
                            class="rounded-2xl border border-[#e6cf96] bg-linear-to-b from-[#fdf6e6] to-white p-5 text-center dark:border-[#6b5b37] dark:from-[#34302a] dark:to-[#292c3c]"
                        >
                            <div
                                class="text-[0.625rem] font-bold uppercase tracking-wide text-brand-gold-500 dark:text-[#e5c890]"
                            >
                                {surahName($verseStudyAyah.surah)} · {$verseStudyAyah.surah}:{$verseStudyAyah.ayah}
                            </div>
                            <div
                                dir="rtl"
                                class="mt-2 font-scheherazade text-3xl leading-relaxed text-brand-charcoal-900 dark:text-[#c6d0f5]"
                            >
                                {verseText?.arabic}
                            </div>
                            {#if verseText?.translation}
                                <p
                                    class="mx-auto mt-2 max-w-xl text-[0.75rem] italic text-brand-charcoal-400 dark:text-[#a5adce]"
                                >
                                    {verseText.translation}
                                </p>
                            {/if}
                        </div>
                    </div>

                    <div class="area-grammar">
                        <GrammarNode context={grammarContext} />
                    </div>
                    <div class="area-related">
                        <RelatedVersesNode
                            {selection}
                            surah={$verseStudyAyah.surah}
                            ayah={$verseStudyAyah.ayah}
                        />
                    </div>

                    <div class="area-ask">
                        <AskAiNode
                            arabic={verseText?.arabic ?? ""}
                            contextPrompt={grammarContext}
                        />
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .hub-canvas {
        background-color: #fdfcfa;
        background-image: radial-gradient(circle, #e8e0cf 1.4px, transparent 1.4px);
        background-size: 24px 24px;
    }
    :global(.dark) .hub-canvas {
        background-color: #232634;
        background-image: radial-gradient(circle, #363a4f 1.4px, transparent 1.4px);
    }

    .hub-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(260px, 1.1fr) minmax(0, 1fr);
        grid-template-areas:
            "morph  ayah    grammar"
            "root   ayah    related"
            ".      ask     .";
        gap: 18px;
        align-items: start;
    }
    .area-morph { grid-area: morph; }
    .area-root { grid-area: root; }
    .area-ayah { grid-area: ayah; }
    .area-grammar { grid-area: grammar; }
    .area-related { grid-area: related; }
    .area-ask { grid-area: ask; }

    /* A soft halo behind the ayah card reads as "the hub everything radiates
       from" without needing measured connector lines that would break on
       resize. */
    .hub-center {
        filter: drop-shadow(0 12px 26px rgba(47, 47, 47, 0.12));
    }

    @media (max-width: 840px) {
        .hub-grid {
            grid-template-columns: 1fr;
            grid-template-areas:
                "ayah"
                "morph"
                "root"
                "grammar"
                "related"
                "ask";
        }
    }
</style>
