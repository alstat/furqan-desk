<script lang="ts">
	import Icon from '@iconify/svelte';
	import ControlCard from '../cards/ControlCard.svelte';
	import GroupCards from '../cards/GroupCards.svelte';
	import {
		selectedSurahIdx,
		selectedSurahName,
		surahLabels,
		hideSurahPage,
		isSidebar,
	} from '$lib/stores/quran.svelte';
	import { morphFontFamily, morphFontSize } from '$lib/stores/morphology.store';
	import { loadMorphologySurah, loadBasmallahMorphology } from '$lib/functions/widgets/surahWidget';
	import { onMount } from 'svelte';

	let font: string = $state('font-scheherazade');
	let textSize: string = $state('text-xl');
	let hideSurah: boolean = $state(false);

	onMount(() => { loadBasmallahMorphology(); });

	$effect(() => { morphFontFamily.set(font); });
	$effect(() => { morphFontSize.set(textSize); });
	$effect(() => { hideSurahPage.set(() => hideSurah); });

	$effect(() => {
		const idx = $selectedSurahIdx;
		selectedSurahName.set($surahLabels[idx - 1]?.ar ?? '');
		loadMorphologySurah(idx);
	});

	function onSurahChange(event: Event) {
		const idx = parseInt((event.target as HTMLSelectElement).value);
		selectedSurahIdx.set(idx);
	}

	const selectClass = 'w-full appearance-none cursor-pointer rounded-xl border border-slate-200 bg-white/80 px-3 py-2 pr-8 text-sm text-slate-700 transition-all focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100 hover:border-slate-300 hover:bg-white';
	const labelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400';
</script>

{#snippet surahCardBody()}
	<div class="px-4 py-3">
		<label for="surah-idx" class={labelClass}>Surah</label>
		<div class="relative">
			<select
				id="surah-idx"
				onchange={onSurahChange}
				class="{selectClass} pl-8 text-center font-scheherazade"
				dir="rtl"
			>
				{#each $surahLabels as label, i}
					<option value={`${i + 1}`} title={label.en} selected={$selectedSurahIdx - 1 === i}>
						{label.ar}
					</option>
				{/each}
			</select>
			<span class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
				<Icon icon="charm:chevron-down" width="0.75rem" />
			</span>
		</div>
	</div>
{/snippet}

{#snippet fontBody()}
	<div class="flex flex-col gap-3.5 px-4 py-3">
		<div>
			<label for="surah-font-family" class={labelClass}>Font Family</label>
			<div class="relative">
				<select id="surah-font-family" bind:value={font} class={selectClass}>
					<option value="font-scheherazade">Scheherazade New</option>
					<option value="font-amiri">Amiri Qur'an</option>
				</select>
				<span class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
					<Icon icon="charm:chevron-down" width="0.75rem" />
				</span>
			</div>
		</div>
		<div>
			<label for="surah-font-size" class={labelClass}>Font Size</label>
			<div class="relative">
				<select id="surah-font-size" bind:value={textSize} class={selectClass}>
					<option value="text-base">Small</option>
					<option value="text-xl">Medium</option>
					<option value="text-3xl">Large</option>
				</select>
				<span class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
					<Icon icon="charm:chevron-down" width="0.75rem" />
				</span>
			</div>
		</div>
		<div class="flex items-center justify-between">
			<span class={labelClass}>Hide Surah Page</span>
			<button
				role="switch"
				aria-checked={hideSurah}
				onclick={() => {
				hideSurah = !hideSurah;
				if (hideSurah && !$isSidebar) $isSidebar = true;
			}}
				class="cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full transition-colors {hideSurah ? 'bg-slate-600' : 'bg-slate-200'}"
			>
				<span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform {hideSurah ? 'translate-x-4' : 'translate-x-1'}"></span>
			</button>
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
