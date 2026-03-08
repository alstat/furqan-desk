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
	import { loadMorphologySurah, loadBasmallahMorphology } from '$lib/functions/widgets/surahWidget';
	import { onMount } from 'svelte';

	let font: string = $state('font-scheherazade');
	let textSize: string = $state('text-xl');

	onMount(() => { loadBasmallahMorphology(); });

	$effect(() => { morphFontFamily.set(font); });
	$effect(() => { morphFontSize.set(textSize); });

	$effect(() => {
		const idx = $selectedSurahIdx;
		selectedSurahName.set($surahLabels[idx - 1]?.ar ?? '');
		loadMorphologySurah(idx);
	});

	function onSurahChange(event: Event) {
		const idx = parseInt((event.target as HTMLSelectElement).value);
		selectedSurahIdx.set(idx);
	}

	const selectClass = 'w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus:border-slate-300 focus:outline-none';
</script>

{#snippet surahCardBody()}
	<div class="px-4 py-3">
		<label for="surah-idx" class="mb-1.5 block text-xs font-medium text-slate-400">Surah</label>
		<select
			id="surah-idx"
			onchange={onSurahChange}
			class="{selectClass} text-center font-scheherazade"
			dir="rtl"
		>
			{#each $surahLabels as label, i}
				<option value={`${i + 1}`} title={label.en} selected={$selectedSurahIdx - 1 === i}>
					{label.ar}
				</option>
			{/each}
		</select>
	</div>
{/snippet}

{#snippet fontBody()}
	<div class="flex flex-col gap-3 px-4 py-3">
		<div>
			<label for="surah-font-family" class="mb-1.5 block text-xs font-medium text-slate-400">Font Family</label>
			<select id="surah-font-family" bind:value={font} class={selectClass}>
				<option value="font-scheherazade">Scheherazade New</option>
				<option value="font-amiri">Amiri Qur'an</option>
			</select>
		</div>
		<div>
			<label for="surah-font-size" class="mb-1.5 block text-xs font-medium text-slate-400">Font Size</label>
			<select id="surah-font-size" bind:value={textSize} class={selectClass}>
				<option value="text-base">Small</option>
				<option value="text-xl">Medium</option>
				<option value="text-3xl">Large</option>
			</select>
		</div>
	</div>
{/snippet}

{#snippet collapsedIcon()}
	<Icon icon="solar:book-bookmark-bold-duotone" width="1.5em" />
{/snippet}

{#snippet controlCard()}
	<div class="space-y-2">
		<ControlCard cardTitle={'Surah'} cardBody={surahCardBody} />
		<ControlCard cardTitle={'Display'} cardBody={fontBody} />
	</div>
{/snippet}

<GroupCards {controlCard} {collapsedIcon} xPosition={'right'} />
