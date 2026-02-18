<script lang="ts">
    import { convertToArabicNumbers } from "$lib/functions/utils/utils";
    import {
        surahMorphology,
        selectedSurahName,
    } from "$lib/stores/quran.svelte";
    import { morphFontFamily } from "$lib/stores/morphology.store";
    import type { MorphWord } from "$lib/types/morphology";
    import WordMorphologyPopover from "./WordMorphologyPopover.svelte";

    // State for selected word
    let selectedWord: { word: MorphWord; ayahNum: number } | null =
        $state(null);
    let popoverPosition = $state({ x: 0, y: 0 });

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

        // Calculate position for popover
        const rect = (event.target as HTMLElement).getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        let x = rect.left;
        let y = rect.bottom + window.scrollY + 5;

        // Adjust if popover would go off-screen
        if (x + 320 > viewportWidth) {
            x = viewportWidth - 330;
        }
        if (rect.bottom + 300 > viewportHeight) {
            y = rect.top + window.scrollY - 10;
        }

        popoverPosition = { x, y };
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
        <div class="leading-loose">
            {#each $surahMorphology.ayahs as ayahData}
                {#each ayahData.words as word}<span
                        role="button"
                        tabindex="0"
                        class="morph-word {$morphFontFamily} cursor-pointer rounded px-0.5 transition-colors {getWordColor(
                            word,
                        )} {selectedWord?.word === word &&
                        selectedWord?.ayahNum === ayahData.ayah
                            ? 'bg-yellow-200'
                            : ''}"
                        onclick={(e) => handleWordClick(e, word, ayahData.ayah)}
                        onkeydown={(e) => e.key === 'Enter' && handleWordClick(e as unknown as MouseEvent, word, ayahData.ayah)}
                    >{word.combined_arabic}</span>{/each}<span class="px-1 font-scheherazade text-lime-700">﴿{convertToArabicNumbers(ayahData.ayah)}﴾</span>
            {/each}
        </div>
    {:else}
        <div class="py-8 text-center text-gray-500">
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
