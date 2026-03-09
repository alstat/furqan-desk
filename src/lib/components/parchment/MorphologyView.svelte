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
    import { onMount, tick } from "svelte";

    // State for selected word
    let selectedWord: { word: MorphWord; ayahNum: number } | null =
        $state(null);
    let popoverPosition = $state({ x: 0, y: 0, placement: 'below' as 'above' | 'below' });

    // ── Sliding-window rendering ──────────────────────────────────────────────────
    // Instead of rendering the whole surah progressively (which stuffs thousands of
    // spans into the DOM), we keep at most MAX_RENDERED ayahs in the DOM at any time.
    // More ayahs load as the user scrolls toward the sentinel at the bottom; when the
    // window overflows MAX_RENDERED we trim from the top and compensate with padding
    // so the scroll position appears unchanged.  On navigation the DOM therefore never
    // holds more than MAX_RENDERED × ~25 spans — making teardown fast regardless of
    // how deep into a surah the user was.

    const CHUNK_SIZE = 30;
    const MAX_RENDERED = 60;   // max ayahs kept in DOM at once

    let renderStart    = $state(0);
    let renderEnd      = $state(0);
    let topSpacerPx    = $state(0);   // compensates for top-trimmed content
    let bottomSpacerPx = $state(0);   // compensates for bottom-trimmed content (when scrolling back up)
    let renderComplete = $state(false);
    let renderRafId: number | null = null;

    // Reset the window whenever the surah changes.
    $effect(() => {
        const total = $surahMorphology?.ayahs?.length ?? 0;

        if (renderRafId !== null) { cancelAnimationFrame(renderRafId); renderRafId = null; }

        renderComplete = false;
        renderStart    = 0;
        renderEnd      = Math.min(CHUNK_SIZE, total);
        topSpacerPx    = 0;
        bottomSpacerPx = 0;

        // Mark ready after the first chunk has been painted.
        if (total > 0) {
            renderRafId = requestAnimationFrame(() => { renderRafId = null; renderComplete = true; });
        }

        return () => { if (renderRafId !== null) { cancelAnimationFrame(renderRafId); renderRafId = null; } };
    });

    // Sentinel elements: bottom triggers load-more, top triggers load-previous.
    let sentinelEl    = $state<HTMLElement | null>(null);
    let topSentinelEl = $state<HTMLElement | null>(null);

    $effect(() => {
        const el    = sentinelEl;
        if (!el) return;

        const total = $surahMorphology?.ayahs?.length ?? 0;
        let cancelled = false;

        // Load one chunk. Uses two ticks when trimming so we can measure the exact
        // height removed before adding new content — giving correct scroll compensation.
        const loadNextChunk = async () => {
            if (cancelled || renderEnd >= total) return;

            const newEnd     = Math.min(renderEnd + CHUNK_SIZE, total);
            const windowSize = newEnd - renderStart;
            const scrollEl   = el.closest('[data-scroll-container]') as HTMLElement | null;

            if (windowSize > MAX_RENDERED) {
                const trimCount = windowSize - MAX_RENDERED;
                const prevH     = scrollEl?.scrollHeight ?? 0;

                renderStart += trimCount;       // Phase 1 — remove top ayahs
                await tick();
                if (cancelled) return;

                if (scrollEl) topSpacerPx += prevH - scrollEl.scrollHeight; // exact removed px

                const prevH2 = scrollEl?.scrollHeight ?? 0;
                renderEnd = newEnd;             // Phase 2 — add bottom ayahs
                await tick();
                if (cancelled) return;

                // Newly rendered bottom content replaces any bottom spacer
                if (bottomSpacerPx > 0 && scrollEl) {
                    const heightAdded = scrollEl.scrollHeight - prevH2;
                    bottomSpacerPx = Math.max(0, bottomSpacerPx - heightAdded);
                }
            } else {
                const prevH = scrollEl?.scrollHeight ?? 0;
                renderEnd = newEnd;
                await tick();
                if (cancelled) return;

                // Newly rendered bottom content replaces any bottom spacer
                if (bottomSpacerPx > 0 && scrollEl) {
                    const heightAdded = scrollEl.scrollHeight - prevH;
                    bottomSpacerPx = Math.max(0, bottomSpacerPx - heightAdded);
                }
            }

            if (cancelled) return;

            // Register newly rendered spans with the tajweed highlight observer.
            if (tajweedObserver) {
                for (const span of document.querySelectorAll<HTMLElement>('.morph-word[data-arabic]')) {
                    tajweedObserver.observe(span);
                }
            }
        };

        const obs = new IntersectionObserver(async ([entry]) => {
            if (!entry.isIntersecting) return;

            // Loop instead of a single load so fast scrolling doesn't leave a gap:
            // after each chunk we re-check whether the sentinel is still near the
            // viewport and keep going if so.
            while (!cancelled && renderEnd < total) {
                await loadNextChunk();
                if (cancelled) break;

                const scrollEl       = el.closest('[data-scroll-container]') as HTMLElement | null;
                const containerBottom = scrollEl
                    ? scrollEl.getBoundingClientRect().bottom
                    : window.innerHeight;

                // Stop when the sentinel has moved well below the visible area.
                if (el.getBoundingClientRect().top > containerBottom + 400) break;
            }
        }, { rootMargin: '600px 0px', threshold: 0 });

        obs.observe(el);
        return () => { cancelled = true; obs.disconnect(); };
    });

    // Top sentinel: when it enters view the user has scrolled back up into the spacer
    // area — restore the previous chunk and trim from the bottom to maintain MAX_RENDERED.
    $effect(() => {
        const el = topSentinelEl;
        if (!el) return;

        let cancelled = false;

        const loadPrevChunk = async () => {
            if (cancelled || renderStart <= 0) return;

            const newStart = Math.max(0, renderStart - CHUNK_SIZE);
            const scrollEl = el.closest('[data-scroll-container]') as HTMLElement | null;
            const prevH    = scrollEl?.scrollHeight ?? 0;

            renderStart = newStart;         // Phase 1 — add top ayahs
            await tick();
            if (cancelled) return;

            const heightAdded = (scrollEl?.scrollHeight ?? 0) - prevH;
            // Reduce spacer by the height of newly rendered content (content replaced spacer).
            // Browser scroll-anchoring keeps the viewport stable during the content addition;
            // reducing the spacer by the same amount keeps scrollHeight and positions unchanged.
            topSpacerPx = Math.max(0, topSpacerPx - heightAdded);

            // Trim from bottom if window now exceeds MAX_RENDERED
            const windowSize = renderEnd - newStart;
            if (windowSize > MAX_RENDERED) {
                const trimCount = windowSize - MAX_RENDERED;
                const prevH2    = scrollEl?.scrollHeight ?? 0;

                renderEnd -= trimCount;     // Phase 2 — remove bottom ayahs
                await tick();
                if (cancelled) return;

                bottomSpacerPx += Math.max(0, prevH2 - (scrollEl?.scrollHeight ?? 0));
            }

            if (tajweedObserver) {
                for (const span of document.querySelectorAll<HTMLElement>('.morph-word[data-arabic]')) {
                    tajweedObserver.observe(span);
                }
            }
        };

        const obs = new IntersectionObserver(async ([entry]) => {
            if (!entry.isIntersecting) return;

            while (!cancelled && renderStart > 0) {
                await loadPrevChunk();
                if (cancelled) break;

                const scrollEl    = el.closest('[data-scroll-container]') as HTMLElement | null;
                const containerTop = scrollEl ? scrollEl.getBoundingClientRect().top : 0;

                // Stop when the sentinel has moved well above the visible area.
                if (el.getBoundingClientRect().bottom < containerTop - 400) break;
            }
        }, { rootMargin: '600px 0px', threshold: 0 });

        obs.observe(el);
        return () => { cancelled = true; obs.disconnect(); };
    });

    // ── CSS Custom Highlight API (character-level tajweed colors, no DOM splitting) ──
    const supportsHighlightAPI =
        typeof CSS !== 'undefined' && 'highlights' in CSS;

    onMount(() => {
        if (!supportsHighlightAPI) return;
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

    // Sliding-window highlights: Ranges are added on entry and removed on exit so the
    // live Range count stays proportional to the visible area, not the scroll history.
    let tajweedObserver: IntersectionObserver | null = null;

    function teardownObserver() {
        tajweedObserver?.disconnect();
        tajweedObserver = null;
        clearHighlights();
    }

    function setupObserver() {
        if (!supportsHighlightAPI) return;

        tajweedObserver?.disconnect();
        clearHighlights();

        const hl = (CSS as any).highlights;
        const spanRanges = new Map<HTMLElement, Array<{ hlName: string; range: Range }>>();

        tajweedObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const span = entry.target as HTMLElement;

                if (entry.isIntersecting) {
                    if (spanRanges.has(span)) continue;

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
                    const saved = spanRanges.get(span);
                    if (saved) {
                        for (const { hlName, range } of saved) {
                            (hl.get(hlName) as any)?.delete(range);
                        }
                        spanRanges.delete(span);
                    }
                }
            }
        }, { rootMargin: '800px 0px', threshold: 0 });

        for (const span of document.querySelectorAll<HTMLElement>('.morph-word[data-arabic]')) {
            tajweedObserver.observe(span);
        }
    }

    $effect(() => {
        const enabled = $tajweedEnabled;
        const done    = renderComplete;

        teardownObserver();
        if (done && enabled) setupObserver();

        return () => teardownObserver();
    });

    function getWordColor(word: MorphWord): string {
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

    const POPOVER_WIDTH = 352;
    const POPOVER_MIN_HEIGHT = 320;

    function handleWordClick(event: MouseEvent, word: MorphWord, ayahNum: number) {
        if (selectedWord?.word === word && selectedWord?.ayahNum === ayahNum) {
            selectedWord = null;
            return;
        }

        const rect = (event.target as HTMLElement).getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth  = window.innerWidth;

        let x = rect.left;
        if (x + POPOVER_WIDTH > viewportWidth) x = viewportWidth - POPOVER_WIDTH - 8;
        if (x < 8) x = 8;

        const spaceBelow = viewportHeight - rect.bottom;
        const placement  = spaceBelow >= POPOVER_MIN_HEIGHT ? 'below' : 'above';
        const y          = placement === 'below' ? rect.bottom : rect.top;

        popoverPosition = { x, y, placement };
        selectedWord    = { word, ayahNum };
    }

    function handleClickOutside(event: MouseEvent) {
        const clickedElement = event.target as HTMLElement;
        const isPopoverClick = clickedElement.closest(".ayah-tooltip");
        const isWordClick    = clickedElement.closest(".morph-word");

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

        <!-- Sliding window: topSpacerPx pads for trimmed-top content so scroll position is preserved -->
        <div style={topSpacerPx > 0 ? `padding-top: ${topSpacerPx}px` : ''}>
            <!-- Top sentinel: entering view triggers loading of previous chunks -->
            {#if renderStart > 0}
                <div bind:this={topSentinelEl} aria-hidden="true" class="h-px"></div>
            {/if}
            <div dir="rtl" class="leading-loose w-full text-center wrap-break-word" style="contain: style;"
                >{#each $surahMorphology.ayahs.slice(renderStart, renderEnd) as ayahData}{#each ayahData.words as word, wi}<span
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

            <!-- Bottom sentinel: entering view triggers loading of next chunk -->
            {#if renderEnd < ($surahMorphology?.ayahs?.length ?? 0)}
                <div bind:this={sentinelEl} aria-hidden="true" class="h-px"></div>
            {/if}

            <!-- Bottom spacer: compensates for bottom-trimmed content when scrolling back up -->
            {#if bottomSpacerPx > 0}
                <div style="height: {bottomSpacerPx}px" aria-hidden="true"></div>
            {/if}
        </div>
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
