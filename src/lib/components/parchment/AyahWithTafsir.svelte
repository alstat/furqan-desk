<script lang="ts">
    import { convertToArabicNumbers } from '$lib/functions/utils/utils';
	import { surah, selectedSurahName, surahTranslation, surahTafsir, fontFamily, fontSize, selectedSurahIdx } from '$lib/stores/quran.svelte';
    import type { Dir } from '$lib/functions/utils/utils';
	import Icon from '@iconify/svelte';
    import Tafsir from './Tafsir.svelte';
	import Translation from './Translation.svelte';

	// State for tooltip
	let selectedAyahIndex: number | null = $state(null);
	let tooltipPosition = $state({ x: 0, y: 0 });

	// Handle click event
	function handleAyahClick(event: MouseEvent | KeyboardEvent, idx: number) {
		console.log('Ayah clicked:', idx); // Debug log

		// If clicking the same ayah, close the tooltip
		if (selectedAyahIndex === idx) {
			console.log('Closing tooltip - same ayah clicked'); // Debug log
			selectedAyahIndex = null;
			return;
		}

		// Get click position for tooltip placement
		const rect = (event.target as HTMLElement).getBoundingClientRect();
		tooltipPosition = {
			x: rect.left,
			y: rect.bottom + window.scrollY
		};
		console.log('Setting selectedAyahIndex to:', idx); // Debug log
		console.log('Tooltip position:', tooltipPosition); // Debug log
		selectedAyahIndex = idx;
	}

	// Close tooltip when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const clickedElement = event.target as HTMLElement;
		const isTooltipClick = clickedElement.closest('.ayah-tooltip');
		const isAyahClick = clickedElement.closest('.ayah-text');

		console.log('Click outside - selectedAyahIndex:', selectedAyahIndex); // Debug log
		console.log('Is tooltip click:', isTooltipClick); // Debug log
		console.log('Is ayah click:', isAyahClick); // Debug log

		if (selectedAyahIndex !== null && !isTooltipClick && !isAyahClick) {
			console.log('Closing tooltip'); // Debug log
			selectedAyahIndex = null;
		}
	}
</script>
<svelte:window on:click={handleClickOutside} />
<div>
    <div
        class="mb-5
              text-center font-scheherazade text-2xl supports-[-webkit-hyphens:none]:font-scheherazade supports-[not(-webkit-hyphens:none)]:font-reem"
    >
        {$selectedSurahName}
    </div>
    {#each $surah as formItem, idx}
        <!-- DON'T REMOVE IT: note ayah-text here is not for css style rather for tracking which div to click -->
        <div
            class={`ayah-text ${$fontFamily()} inline cursor-pointer hover:bg-yellow-200 ${selectedAyahIndex === idx ? 'bg-yellow-200' : ''}`}
            onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    handleAyahClick(e, idx);
                }
            }}
            tabindex="0"
            role="button"
            onclick={(e) => handleAyahClick(e, idx)}
        >
            <div class="flex flex-col border border-amber-300 shadow-sm hover:shadow-md my-4 p-2 bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100">
                <div dir="rtl" class="flex flex-row justify-stretch">
                    <div class="w-11/12">
                        {formItem}
                    </div>
                    <div class="w-1/12 text-sm text-left">
                        {$selectedSurahIdx}:{idx + 1}
                    </div>
                </div>
                <div class="flex flex-row justify-center">
                    <div dir={`rtl` as Dir} class={`${$fontSize() == 'text-base' ? 'text-sm' : $fontSize() == 'text-xl' ? 'text-base' : 'text-lg'} w-11/12 max-w-[600px] my-2 text-lime-800 leading-tight ${$fontFamily()}`}>
                        {$surahTafsir[idx]}
                    </div>
                </div>  
            </div>
        </div>
    {/each}
    {#if selectedAyahIndex !== null}
        <div
            class="fixed z-50 rounded-md border border-slate-200 bg-amber-50 bg-opacity-50 p-2 shadow-sm backdrop-blur-sm hover:bg-opacity-90"
            style="left: {tooltipPosition.x}px; top: {tooltipPosition.y}px;"
        >
            <div class="flex flex-row gap-1 text-xs" dir="ltr">
                <button
                    title="Morphological Analysis"
                    class="bg-opacity-50 p-1 text-sm text-lime-700 transition-colors hover:bg-lime-700 hover:bg-opacity-50 hover:text-lime-50 active:bg-lime-600"
                >
                    <Icon icon="ph:share-network-duotone" width="1.5em" />
                </button>
                <button
                    title="Rhythmic Analysis"
                    class="bg-opacity-50 p-1 text-sm text-lime-700 transition-colors hover:bg-lime-700 hover:bg-opacity-50 hover:text-lime-50 active:bg-lime-600"
                >
                    <Icon icon="solar:colour-tuneing-line-duotone" width="1.5em" />
                </button>
                <button
                    title="Tafsir"
                    class="bg-opacity-50 p-1 text-sm text-lime-700 transition-colors hover:bg-lime-700 hover:bg-opacity-50 hover:text-lime-50 active:bg-lime-600"
                >
                    <Icon icon="solar:book-2-bold-duotone" width="1.5em" />
                </button>
                <button
                    title="Translate"
                    class="bg-opacity-50 p-1 text-sm text-lime-700 transition-colors hover:bg-lime-700 hover:bg-opacity-50 hover:text-lime-50 active:bg-lime-600"
                >
                    <Icon icon="ph:translate-duotone" width="1.5em" />
                </button>
            </div>
        </div>
    {/if}
</div>