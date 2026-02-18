<script lang="ts">
	import Icon from '@iconify/svelte';
	import ControlCard from '../cards/ControlCard.svelte';
	import GroupCards from '../cards/GroupCards.svelte';
	import {
		selectedSurahIdx,
		selectedSurahName,
		surahLabels,
	} from '$lib/stores/quran.svelte';
	import { morphFontFamily, morphFontSize } from '$lib/stores/morphology.store';

	import { loadMorphologySurah } from '$lib/functions/widgets/surahWidget';
	import { selectBtnStyle } from '$lib/data/toolbar/toolbar';

	let font: string = $state('font-scheherazade');
	let textSize: string = $state('text-xl');

	// Reactively sync font/size to dedicated morphology stores
	$effect(() => {
		morphFontFamily.set(font);
	});

	$effect(() => {
		morphFontSize.set(textSize);
	});

	// When selected surah changes: update name label and load morphology data
	$effect(() => {
		const idx = $selectedSurahIdx;
		selectedSurahName.set($surahLabels[idx - 1]?.ar ?? '');
		loadMorphologySurah(idx);
	});

	function onSurahChange(event: Event) {
		const idx = parseInt((event.target as HTMLSelectElement).value);
		selectedSurahIdx.set(idx);
	}
</script>

{#snippet surahCardBody()}
	<div class="flex flex-col">
		<div class="grid grid-cols-2 justify-center space-x-1 p-4">
			<div class="flex flex-col justify-items-center space-y-5">
				<div>Surah</div>
			</div>
			<div class="flex flex-col space-y-2">
				<select
					id="surah-idx"
					onchange={onSurahChange}
					class="w-36 cursor-pointer rounded-md border border-slate-300 bg-slate-100 p-1 text-center font-scheherazade text-sm text-lime-700"
				>
					{#each $surahLabels as label, i}
						<option
							value={`${i + 1}`}
							title={label.en}
							selected={$selectedSurahIdx - 1 === i}
						>{label.ar}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>
{/snippet}

{#snippet fontBody()}
	<div class="grid grid-cols-2 space-x-1 space-y-2 p-4">
	<div>Font Family</div>
	<select
		bind:value={font}
		class={selectBtnStyle + ' w-36'}
	>
		<option value="font-scheherazade" selected>Scheherazade</option>
		<option value="font-amiri">Amiri Qur'an</option>
	</select>
	<div>Font Size</div>
	<select
		bind:value={textSize}
		class={selectBtnStyle + ' w-36'}
	>
		<option value="text-base">Small</option>
		<option value="text-xl" selected>Medium</option>
		<option value="text-3xl">Large</option>
	</select>
	<div></div>
	</div>
{/snippet}

{#snippet collapsedIcon()}
	<Icon icon="hugeicons:quran-01" width="1.5em" />
{/snippet}

{#snippet controlCard()}
	<div class="space-y-2">
		<ControlCard cardTitle={'Surah Controls'} cardBody={surahCardBody} />
		<ControlCard cardTitle={'Page Settings'} cardBody={fontBody} />
	</div>
{/snippet}

<GroupCards {controlCard} {collapsedIcon} xPosition={'right'} />
