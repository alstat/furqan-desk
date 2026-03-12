<script lang="ts">
    import { convertToArabicNumbers } from "$lib/functions/utils/utils";
    import {
        surahMorphology,
        basmallahMorphology,
        selectedSurahName,
    } from "$lib/stores/quran.svelte";
    import { morphFontFamily } from "$lib/stores/morphology.store";
    import type { MorphWord } from "$lib/types/morphology";
    import WordMorphologyPopover from "./WordMorphologyPopover.svelte";
    import { setLastRead } from "$lib/functions/bookmarks";
    import { currentReadingAyah } from "$lib/stores/bookmarks.store";
    import Icon from "@iconify/svelte";
    import { requestPlayAyah } from "$lib/stores/recitation.store";
    import { invoke } from '@tauri-apps/api/core';
    import { activeTranslatorId, surahTranslation, transliterationEnabled, surahTransliteration } from '$lib/stores/translation.store';
    import type { AyahTranslation } from '$lib/stores/translation.store';

    $effect(() => {
        const tid = $activeTranslatorId;
        const surah = $surahMorphology?.surah;
        if (!tid || !surah) { surahTranslation.set(null); return; }
        invoke<AyahTranslation[]>('get_surah_translation', { surah, translatorId: tid })
            .then(rows => surahTranslation.set(rows))
            .catch(() => surahTranslation.set(null));
    });

    $effect(() => {
        const enabled = $transliterationEnabled;
        const surah = $surahMorphology?.surah;
        if (!enabled || !surah) { surahTransliteration.set(null); return; }
        invoke<Array<{ayah: number; text: string}>>('get_surah_transliteration', { surah })
            .then(rows => surahTransliteration.set(new Map(rows.map(r => [r.ayah, r.text]))))
            .catch(() => surahTransliteration.set(null));
    });

    const translationMap = $derived(
        $surahTranslation
            ? new Map($surahTranslation.map(r => [r.ayah, r]))
            : null
    );

    // State for selected word
    let selectedWord: { word: MorphWord; ayahNum: number } | null =
        $state(null);
    let popoverPosition = $state({ x: 0, y: 0, placement: 'below' as 'above' | 'below' });

    // Progressive rendering
    const CHUNK_SIZE = 30;
    let renderedAyahCount = $state(CHUNK_SIZE);
    let renderRafId: number | null = null;

    $effect(() => {
        const total = $surahMorphology?.ayahs?.length ?? 0;

        if (renderRafId !== null) { cancelAnimationFrame(renderRafId); renderRafId = null; }

        renderedAyahCount = Math.min(CHUNK_SIZE, total);

        if (total <= CHUNK_SIZE) return;

        function renderMore() {
            renderRafId = null;
            renderedAyahCount = Math.min(renderedAyahCount + CHUNK_SIZE, total);
            if (renderedAyahCount < total) {
                renderRafId = requestAnimationFrame(renderMore);
            }
        }
        renderRafId = requestAnimationFrame(renderMore);

        return () => { if (renderRafId !== null) { cancelAnimationFrame(renderRafId); renderRafId = null; } };
    });

    function getWordColor(word: MorphWord): string {
        const stemToken = word.tokens.find(
            (t) => !t.features.prefix_type && !t.features.suffix_type,
        );
        const tag = stemToken?.tag || word.tokens[0]?.tag || "N";

        const colors: Record<string, string> = {
            N: "hover:bg-blue-100 dark:hover:bg-blue-800/40",
            V: "hover:bg-green-100 dark:hover:bg-green-800/40",
            P: "hover:bg-purple-100 dark:hover:bg-purple-800/40",
            PN: "hover:bg-indigo-100 dark:hover:bg-indigo-800/40",
            ADJ: "hover:bg-yellow-100 dark:hover:bg-yellow-800/40",
            DET: "hover:bg-gray-100 dark:hover:bg-gray-600/40",
            PRON: "hover:bg-pink-100 dark:hover:bg-pink-800/40",
            REL: "hover:bg-pink-100 dark:hover:bg-pink-800/40",
            DEM: "hover:bg-pink-100 dark:hover:bg-pink-800/40",
            CONJ: "hover:bg-orange-100 dark:hover:bg-orange-800/40",
            NEG: "hover:bg-red-100 dark:hover:bg-red-800/40",
        };
        return colors[tag] || "hover:bg-slate-100 dark:hover:bg-slate-600/40";
    }

    const POPOVER_WIDTH = 352;  // w-[22rem]
    const POPOVER_MIN_HEIGHT = 320;

    function handleWordClick(event: MouseEvent, word: MorphWord, ayahNum: number) {
        if (selectedWord?.word === word && selectedWord?.ayahNum === ayahNum) {
            selectedWord = null;
            return;
        }

        const rect = (event.target as HTMLElement).getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        let x = rect.left;
        if (x + POPOVER_WIDTH > viewportWidth) x = viewportWidth - POPOVER_WIDTH - 8;
        if (x < 8) x = 8;

        const spaceBelow = viewportHeight - rect.bottom;
        const placement = spaceBelow >= POPOVER_MIN_HEIGHT ? 'below' : 'above';
        const y = placement === 'below' ? rect.bottom : rect.top;

        popoverPosition = { x, y, placement };
        selectedWord = { word, ayahNum };

        if ($surahMorphology && ayahNum > 0) {
            currentReadingAyah.set({ surah: $surahMorphology.surah, ayah: ayahNum });
            setLastRead($surahMorphology.surah, ayahNum);
        }
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
    <!-- Ornate surah name header -->
    <div class="mb-8" dir="ltr">
        <div class="flex items-center">
            <!-- Left decorative arm -->
            <div class="flex flex-1 items-center">
                <div class="h-px flex-1 bg-linear-to-r from-transparent to-brand-gold-200 dark:to-brand-gold-400/30"></div>
                <div class="flex items-center gap-1 px-2">
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-400/40"></span>
                    <span class="inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/50"></span>
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-400/40"></span>
                </div>
            </div>

            <!-- Surah name panel -->
            <div class="relative border border-brand-gold-400/80 dark:border-brand-gold-200/30 bg-linear-to-b from-brand-gold-50/60 to-white/0 dark:from-brand-gold-100/30 dark:to-transparent px-10 py-2.5">
                <!-- Inner border -->
                <div class="pointer-events-none absolute inset-0.75 border border-brand-gold-200/40 dark:border-brand-gold-200/20"></div>
                <!-- Mid-border diamonds -->
                <span class="absolute -top-1.25 left-1/2 inline-block h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/50"></span>
                <span class="absolute -bottom-1.25 left-1/2 inline-block h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/50"></span>
                <!-- Corner diamonds -->
                <span class="absolute -left-1 -top-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/40"></span>
                <span class="absolute -right-1 -top-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/40"></span>
                <span class="absolute -bottom-1 -left-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/40"></span>
                <span class="absolute -bottom-1 -right-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/40"></span>
                <!-- Surah name -->
                <span class="relative font-amiri text-2xl leading-none text-slate-800 dark:text-[#c6d0f5]">{$selectedSurahName}</span>
            </div>

            <!-- Right decorative arm -->
            <div class="flex flex-1 items-center">
                <div class="flex items-center gap-1 px-2">
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-400/40"></span>
                    <span class="inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/50"></span>
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-400/40"></span>
                </div>
                <div class="h-px flex-1 bg-linear-to-l from-transparent to-brand-gold-200 dark:to-brand-gold-400/30"></div>
            </div>
        </div>
    </div>

    {#if $surahMorphology}
        {#if $surahMorphology.surah !== 1 && $surahMorphology.surah !== 9 && $basmallahMorphology}
            <div class="relative mb-8">

                <!-- Basmallah text with subtle tint, no frame -->
                <div class="relative px-6 py-1">
                    <div class="relative text-center wrap-break-word leading-loose">
                        {#each $basmallahMorphology.words as word}<span
                                role="button"
                                tabindex="0"
                                data-surah={$surahMorphology.surah}
                                data-ayah={0}
                                class="morph-word {$morphFontFamily} cursor-pointer rounded transition-colors inline-block {getWordColor(word)} {selectedWord?.word === word && selectedWord?.ayahNum === 0 ? 'bg-yellow-200 dark:bg-yellow-900/40' : ''}"
                                onclick={(e) => handleWordClick(e, word, 0)}
                                onkeydown={(e) => e.key === 'Enter' && handleWordClick(e as unknown as MouseEvent, word, 0)}
                            >{word.combined_arabic}&nbsp;</span>{/each}
                    </div>
                </div>

            </div>
        {/if}
        {#if translationMap !== null || $surahTransliteration !== null}
            <!-- Block mode: one ayah per row, right-justified, divider between ayahs -->
            <div dir="rtl" class="w-full min-w-0" style="contain: style;">
                {#each $surahMorphology.ayahs.slice(0, renderedAyahCount) as ayahData, i}
                    <div class="{i > 0 ? 'border-t border-brand-sand-200/40 dark:border-[#414559]/40' : ''} pt-2 pb-4">
                        <div class="leading-loose text-right wrap-break-word"
                            >{#each ayahData.words as word}<span
                                dir="rtl"
                                role="button"
                                tabindex="0"
                                data-surah={$surahMorphology.surah}
                                data-ayah={ayahData.ayah}
                                class="morph-word {$morphFontFamily} cursor-pointer rounded transition-colors inline-block {getWordColor(word)} {selectedWord?.word === word && selectedWord?.ayahNum === ayahData.ayah ? 'bg-yellow-200 dark:bg-yellow-900/40' : ''}"
                                onclick={(e) => handleWordClick(e, word, ayahData.ayah)}
                                onkeydown={(e) => e.key === 'Enter' && handleWordClick(e as unknown as MouseEvent, word, ayahData.ayah)}
                            >{word.combined_arabic}&nbsp;</span>{/each}<span id="ayah-{ayahData.ayah}" class="group/ayah-num relative inline-block whitespace-nowrap"><span class="font-scheherazade text-lime-700 dark:text-lime-600 px-1">&#x2060;﴿&#x2060;{convertToArabicNumbers(ayahData.ayah)}&#x2060;﴾&#x2060;</span><button onclick={() => requestPlayAyah.set(ayahData.ayah)} title="Play ayah {ayahData.ayah}" class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity cursor-pointer z-20 flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button></span></div>

                        {#if $surahTransliteration?.has(ayahData.ayah)}
                            <p dir="ltr" class="mt-1 text-sm leading-relaxed text-brand-charcoal-300 dark:text-[#626880] italic">
                                {$surahTransliteration.get(ayahData.ayah)}
                            </p>
                        {/if}

                        {#if translationMap?.has(ayahData.ayah)}
                            {@const entry = translationMap.get(ayahData.ayah)!}
                            {@const fnotes = entry.footnotes ? JSON.parse(entry.footnotes) as Record<string, string> : null}
                            <div dir="auto" class="mt-1.5 text-sm leading-relaxed text-start text-brand-charcoal-500 dark:text-[#a5adce]">
                                <p>{entry.text}</p>
                                {#if fnotes}
                                    <ol class="mt-1.5 space-y-0.5 text-xs text-brand-charcoal-300 dark:text-[#838ba7] list-decimal list-inside">
                                        {#each Object.entries(fnotes) as [num, ftxt]}
                                            <li><span class="font-medium">[{num}]</span> {ftxt}</li>
                                        {/each}
                                    </ol>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {:else}
            <!-- Inline mode: continuous flow like original -->
            <div dir="rtl" class="leading-loose w-full text-center wrap-break-word" style="contain: style;"
                >{#each $surahMorphology.ayahs.slice(0, renderedAyahCount) as ayahData}{#each ayahData.words as word}<span
                    dir="rtl"
                    role="button"
                    tabindex="0"
                    data-surah={$surahMorphology.surah}
                    data-ayah={ayahData.ayah}
                    class="morph-word {$morphFontFamily} cursor-pointer rounded transition-colors inline-block {getWordColor(word)} {selectedWord?.word === word && selectedWord?.ayahNum === ayahData.ayah ? 'bg-yellow-200 dark:bg-yellow-900/40' : ''}"
                    onclick={(e) => handleWordClick(e, word, ayahData.ayah)}
                    onkeydown={(e) => e.key === 'Enter' && handleWordClick(e as unknown as MouseEvent, word, ayahData.ayah)}
                >{word.combined_arabic}&nbsp;</span>{/each}<span id="ayah-{ayahData.ayah}" class="group/ayah-num relative inline-block whitespace-nowrap"><span class="font-scheherazade text-lime-700 dark:text-lime-600 px-1">&#x2060;﴿&#x2060;{convertToArabicNumbers(ayahData.ayah)}&#x2060;﴾&#x2060;</span><button onclick={() => requestPlayAyah.set(ayahData.ayah)} title="Play ayah {ayahData.ayah}" class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity cursor-pointer z-20 flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button></span>{/each}</div>
        {/if}
    {:else}
        <div class="py-8 text-center text-gray-500 dark:text-[#838ba7] h-full min-h-[300px]">
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
