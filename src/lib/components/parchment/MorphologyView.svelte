<script lang="ts">
    import { convertToArabicNumbers } from "$lib/functions/utils/utils";
    import {
        surahMorphology,
        basmallahMorphology,
        selectedSurahName,
    } from "$lib/stores/quran.svelte";
    import { morphFontFamily, tajweedEnabled } from "$lib/stores/morphology.store";
    import { applyTajweed, firstBaseLetter, TAJWEED_COLORS } from "$lib/functions/utils/tajweed";
    import type { MorphWord } from "$lib/types/morphology";
    import WordMorphologyPopover from "./WordMorphologyPopover.svelte";
    import { onMount } from "svelte";

    // State for selected word
    let selectedWord: { word: MorphWord; ayahNum: number } | null =
        $state(null);
    let popoverPosition = $state({ x: 0, y: 0, placement: 'below' as 'above' | 'below' });

    // Progressive rendering
    const CHUNK_SIZE = 30;
    let renderedAyahCount = $state(CHUNK_SIZE);
    let renderComplete = $state(false);
    let renderRafId: number | null = null;

    $effect(() => {
        const total = $surahMorphology?.ayahs?.length ?? 0;

        // Cancel any in-progress render loop from a previous surah
        if (renderRafId !== null) { cancelAnimationFrame(renderRafId); renderRafId = null; }

        renderComplete = false;
        renderedAyahCount = Math.min(CHUNK_SIZE, total);

        if (total <= CHUNK_SIZE) { renderComplete = true; return; }

        function renderMore() {
            renderRafId = null;
            renderedAyahCount = Math.min(renderedAyahCount + CHUNK_SIZE, total);
            if (renderedAyahCount < total) {
                renderRafId = requestAnimationFrame(renderMore);
            } else {
                renderComplete = true;
            }
        }
        renderRafId = requestAnimationFrame(renderMore);

        return () => { if (renderRafId !== null) { cancelAnimationFrame(renderRafId); renderRafId = null; } };
    });

    // ── CSS Custom Highlight API (character-level tajweed colors, no DOM splitting) ──
    const supportsHighlightAPI =
        typeof CSS !== 'undefined' && 'highlights' in CSS;

    onMount(() => {
        if (!supportsHighlightAPI) return;
        // Inject ::highlight() rules once
        const style = document.createElement('style');
        style.id = 'tajweed-highlight-styles';
        style.textContent = Object.values(TAJWEED_COLORS)
            .map(c => `::highlight(tj-${c.replace('#', '')}) { color: ${c}; }`)
            .join('\n');
        document.head.appendChild(style);
        return () => style.remove();
    });

    function clearHighlights() {
        if (!supportsHighlightAPI) return;
        const hl = (CSS as any).highlights as Map<string, unknown>;
        for (const key of [...hl.keys()])
            if ((key as string).startsWith('tj-')) hl.delete(key as string);
    }

    // ── CSS Highlight sliding window ─────────────────────────────────────────────
    // The previous approach accumulated Range objects for every word scrolled past.
    // After scrolling through a long surah the Highlight registry could hold 10,000+
    // live Ranges; clearing them while those spans were still in the DOM forced the
    // browser to repaint every highlighted character — causing multi-second freezes.
    //
    // Fix: treat the highlighted region as a sliding window.  Ranges are ADDED when
    // a span enters the extended viewport and REMOVED when it leaves.  The live Range
    // count is always proportional to what is currently visible (~few hundred),
    // regardless of how far the user has scrolled.  teardownObserver() therefore
    // only ever clears a small, bounded set of Ranges — always fast.

    let tajweedObserver: IntersectionObserver | null = null;

    function teardownObserver() {
        tajweedObserver?.disconnect();
        tajweedObserver = null;
        clearHighlights();      // cheap: only live Ranges in the current viewport window
    }

    function setupObserver() {
        if (!supportsHighlightAPI) return;

        tajweedObserver?.disconnect();
        clearHighlights();

        const hl = (CSS as any).highlights;
        // Per-observer map so that toggling off→on starts with a fresh slate
        const spanRanges = new Map<HTMLElement, Array<{ hlName: string; range: Range }>>();

        tajweedObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const span = entry.target as HTMLElement;

                if (entry.isIntersecting) {
                    if (spanRanges.has(span)) continue;   // already highlighted

                    const arabicText = span.dataset.arabic;
                    if (!arabicText) continue;
                    const nextLetter = span.dataset.nextLetter || null;

                    let textNode: Text | null = null;
                    for (const node of span.childNodes) {
                        if (node.nodeType === Node.TEXT_NODE) { textNode = node as Text; break; }
                    }
                    if (!textNode) continue;

                    const added: Array<{ hlName: string; range: Range }> = [];
                    let pos = 0;
                    for (const chunk of applyTajweed(arabicText, nextLetter)) {
                        if (chunk.color) {
                            try {
                                const r = new Range();
                                r.setStart(textNode, pos);
                                r.setEnd(textNode, pos + chunk.text.length);
                                const hlName = `tj-${chunk.color.replace('#', '')}`;
                                if (!hl.has(hlName)) hl.set(hlName, new (window as any).Highlight());
                                hl.get(hlName).add(r);
                                added.push({ hlName, range: r });
                            } catch { /* offset out of bounds — skip */ }
                        }
                        pos += chunk.text.length;
                    }
                    if (added.length) spanRanges.set(span, added);

                } else {
                    // Span left the extended viewport — remove its Ranges to keep
                    // the live count bounded.
                    const entries = spanRanges.get(span);
                    if (entries) {
                        for (const { hlName, range } of entries) {
                            (hl.get(hlName) as any)?.delete(range);
                        }
                        spanRanges.delete(span);
                    }
                }
            }
        }, {
            // 800 px pre-load above and below so fast scrolling never shows un-highlighted words
            rootMargin: '800px 0px',
            threshold: 0,
        });

        for (const span of document.querySelectorAll<HTMLElement>('.morph-word[data-arabic]')) {
            tajweedObserver.observe(span);
        }
    }

    // Set up the observer once all ayahs are in the DOM and tajweed is on.
    // renderedAyahCount is intentionally kept out of this effect's dependencies
    // to avoid re-creating the observer (and clearing highlights) on every chunk.
    $effect(() => {
        const enabled = $tajweedEnabled;
        const done = renderComplete;

        teardownObserver();

        if (done && enabled) setupObserver();

        return () => teardownObserver();
    });

    function getWordColor(word: MorphWord): string {
        // Get primary tag from the stem (non-prefix/suffix token)
        const stemToken = word.tokens.find(
            (t) => !t.features.prefix_type && !t.features.suffix_type,
        );
        const tag = stemToken?.tag || word.tokens[0]?.tag || "N";

        const colors: Record<string, string> = {
            N: "hover:bg-blue-100",
            V: "hover:bg-green-100",
            P: "hover:bg-purple-100",
            PN: "hover:bg-indigo-100",
            ADJ: "hover:bg-yellow-100",
            DET: "hover:bg-gray-100",
            PRON: "hover:bg-pink-100",
            REL: "hover:bg-pink-100",
            DEM: "hover:bg-pink-100",
            CONJ: "hover:bg-orange-100",
            NEG: "hover:bg-red-100",
        };
        return colors[tag] || "hover:bg-slate-100";
    }

    const POPOVER_WIDTH = 352;  // w-[22rem]
    const POPOVER_MIN_HEIGHT = 320; // minimum space needed to comfortably show below

    function handleWordClick(
        event: MouseEvent,
        word: MorphWord,
        ayahNum: number,
    ) {
        // If clicking the same word, close the popover
        if (selectedWord?.word === word && selectedWord?.ayahNum === ayahNum) {
            selectedWord = null;
            return;
        }

        const rect = (event.target as HTMLElement).getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        // Horizontal: clamp so popover stays within viewport
        let x = rect.left;
        if (x + POPOVER_WIDTH > viewportWidth) x = viewportWidth - POPOVER_WIDTH - 8;
        if (x < 8) x = 8;

        // Vertical: show below when there's enough room, otherwise flip above.
        // y is the anchor edge — rect.bottom for 'below', rect.top for 'above'.
        const spaceBelow = viewportHeight - rect.bottom;
        const placement = spaceBelow >= POPOVER_MIN_HEIGHT ? 'below' : 'above';
        const y = placement === 'below' ? rect.bottom : rect.top;

        popoverPosition = { x, y, placement };
        selectedWord = { word, ayahNum };
    }

    function handleClickOutside(event: MouseEvent) {
        const clickedElement = event.target as HTMLElement;
        const isPopoverClick = clickedElement.closest(".ayah-tooltip");
        const isWordClick = clickedElement.closest(".morph-word");

        if (selectedWord !== null && !isPopoverClick && !isWordClick) {
            selectedWord = null;
        }
    }
</script>

<svelte:window on:click={handleClickOutside} />

<div dir="rtl" class="w-full min-w-0">
    <div
        class="mb-5 text-center font-scheherazade text-2xl supports-[-webkit-hyphens:none]:font-scheherazade supports-[not(-webkit-hyphens:none)]:font-reem"
    >
        {$selectedSurahName}
    </div>

    {#if $surahMorphology}
        {#if $surahMorphology.surah !== 1 && $surahMorphology.surah !== 9 && $basmallahMorphology}
            <div class="mb-4 text-center wrap-break-word leading-loose">
                {#each $basmallahMorphology.words as word, wi}<span
                        role="button"
                        tabindex="0"
                        class="morph-word {$morphFontFamily} cursor-pointer rounded transition-colors  inline-block {$tajweedEnabled ? '' : getWordColor(word)} {selectedWord?.word === word &&
                        selectedWord?.ayahNum === 0
                            ? 'bg-yellow-200'
                            : ''}"
                        data-arabic={word.combined_arabic}
                        data-next-letter={firstBaseLetter($basmallahMorphology.words[wi + 1]?.combined_arabic ?? '') ?? ''}
                        onclick={(e) => handleWordClick(e, word, 0)}
                        onkeydown={(e) => e.key === 'Enter' && handleWordClick(e as unknown as MouseEvent, word, 0)}
                    >{word.combined_arabic}&nbsp;</span>{/each}
            </div>
            <hr class="mb-4 border-slate-200" />
        {/if}
        <div dir="rtl" class="leading-loose w-full text-center wrap-break-word" style="contain: style;"
            >{#each $surahMorphology.ayahs.slice(0, renderedAyahCount) as ayahData}{#each ayahData.words as word, wi}<span
                dir="rtl"
                        role="button"
                        tabindex="0"
                        class="morph-word {$morphFontFamily} cursor-pointer rounded transition-colors inline-block {$tajweedEnabled ? '' : getWordColor(word)} {selectedWord?.word === word &&
                        selectedWord?.ayahNum === ayahData.ayah
                            ? 'bg-yellow-200'
                            : ''}"
                        data-arabic={word.combined_arabic}
                        data-next-letter={firstBaseLetter(ayahData.words[wi + 1]?.combined_arabic ?? '') ?? ''}
                        onclick={(e) => handleWordClick(e, word, ayahData.ayah)}
                        onkeydown={(e) => e.key === 'Enter' && handleWordClick(e as unknown as MouseEvent, word, ayahData.ayah)}
                    >{word.combined_arabic}&nbsp;</span>{/each}<span class="font-scheherazade text-lime-700 px-1 whitespace-nowrap">&#x2060;﴿&#x2060;{convertToArabicNumbers(ayahData.ayah)}&#x2060;﴾&#x2060;</span>{/each}</div>
    {:else}
        <div class="py-8 text-center text-gray-500 h-full">
            Loading morphology data...
        </div>
    {/if}
</div>

{#if selectedWord}
    <WordMorphologyPopover
        word={selectedWord.word}
        position={popoverPosition}
        onClose={() => (selectedWord = null)}
    />
{/if}
