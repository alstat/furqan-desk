<script lang="ts">
	import Icon from '@iconify/svelte';
	import ControlCard from '../cards/ControlCard.svelte';
	import GroupCards from '../cards/GroupCards.svelte';
	import {
		selectedSurahIdx,
		selectedSurahName,
		surahLabels,
	} from '$lib/stores/quran.svelte';
	import { morphFontFamily, morphFontSize, tajweedEnabled } from '$lib/stores/morphology.store';
	import { loadMorphologySurah, loadBasmallahMorphology } from '$lib/functions/widgets/surahWidget';
	import { TAJWEED_COLORS } from '$lib/functions/utils/tajweed';
	import Dialog from '$lib/components/shared/Dialog.svelte';
	import { onMount } from 'svelte';

	let font: string = $state('font-scheherazade');
	let textSize: string = $state('text-xl');
	let tajweedDialogOpen = $state(false);

	const tajweedRules = [
		{
			key: 'ghunnah',
			color: TAJWEED_COLORS.ghunnah,
			name: 'Ghunnah (غُنَّة)',
			arabic: 'نّ / مّ',
			desc: 'Noon or Meem with Shadda — nasalization held for 2 counts.',
		},
		{
			key: 'qalqalah',
			color: TAJWEED_COLORS.qalqalah,
			name: 'Qalqalah (قَلْقَلَة)',
			arabic: 'ق ط ب ج د',
			desc: 'Echo/bounce on the five Qalqalah letters when they carry Sukun.',
		},
		{
			key: 'ikhfa',
			color: TAJWEED_COLORS.ikhfa,
			name: 'Ikhfa (إِخْفَاء)',
			arabic: 'ن sakin / تنوين + 15 letters',
			desc: 'Noon Sakin or Tanwin followed by one of the 15 Ikhfa letters — partial concealment with ghunnah.',
		},
		{
			key: 'idgham_ghunnah',
			color: TAJWEED_COLORS.idgham_ghunnah,
			name: 'Idgham with Ghunnah (إِدْغَام بِغُنَّة)',
			arabic: 'ي ن م و',
			desc: 'Noon Sakin or Tanwin merges into ي ن م و with nasalization.',
		},
		{
			key: 'idgham_no_ghunnah',
			color: TAJWEED_COLORS.idgham_no_ghunnah,
			name: 'Idgham without Ghunnah (إِدْغَام بِلَا غُنَّة)',
			arabic: 'ر ل',
			desc: 'Noon Sakin or Tanwin merges into ر or ل without nasalization.',
		},
		{
			key: 'iqlab',
			color: TAJWEED_COLORS.iqlab,
			name: 'Iqlab (إِقْلَاب)',
			arabic: 'ن sakin / تنوين + ب',
			desc: 'Noon Sakin or Tanwin before ب — the Noon sound changes to Meem.',
		},
		{
			key: 'izhar',
			color: TAJWEED_COLORS.izhar,
			name: 'Izhar (إِظْهَار)',
			arabic: 'ء ه ع ح غ خ',
			desc: 'Noon Sakin or Tanwin before a throat letter — clear, distinct pronunciation.',
		},
		{
			key: 'madd',
			color: TAJWEED_COLORS.madd,
			name: 'Madd (مَدّ)',
			arabic: 'ا و ي',
			desc: 'Elongation letters (Alef, Waw Sakin, Ya Sakin, Alef Madda) — prolonged 2–6 counts depending on context.',
		},
		{
			key: 'lam_jalalah',
			color: TAJWEED_COLORS.lam_jalalah,
			name: 'Lam Jalalah (لَام الجَلَالَة)',
			arabic: 'الله',
			desc: 'The Lam in the word "Allah" — heavy pronunciation (tafkheem) when preceded by a Fatha or Damma.',
		},
	];

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
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-1">
				<label for="tajweed-toggle" class="text-xs font-medium text-slate-400">Tajweed Colors</label>
				<button
					onclick={() => (tajweedDialogOpen = true)}
					class="cursor-pointer text-slate-400 hover:text-slate-600 transition-colors"
					title="Tajweed rules guide"
					aria-label="Open tajweed rules guide"
				>
					<Icon icon="solar:info-circle-linear" width="0.9rem" />
				</button>
			</div>
			<button
				id="tajweed-toggle"
				role="switch"
				aria-checked={$tajweedEnabled}
				onclick={() => tajweedEnabled.update(v => !v)}
				class="relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors {$tajweedEnabled ? 'bg-green-500' : 'bg-slate-300'}"
			>
				<span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform {$tajweedEnabled ? 'translate-x-4' : 'translate-x-1'}"></span>
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

<Dialog
	open={tajweedDialogOpen}
	title="Tajweed Color Guide"
	onClose={() => (tajweedDialogOpen = false)}
>
	{#snippet children()}
		<div class="space-y-3">
			{#each tajweedRules as rule}
				<div class="flex gap-3 items-start">
					<span
						class="mt-0.5 shrink-0 h-3.5 w-3.5 rounded-full border border-black/10"
						style="background-color: {rule.color};"
					></span>
					<div class="min-w-0">
						<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
							<span class="text-xs font-semibold text-slate-700">{rule.name}</span>
							<span class="font-scheherazade text-sm" style="color: {rule.color};">{rule.arabic}</span>
						</div>
						<p class="mt-0.5 text-xs text-slate-500 leading-relaxed">{rule.desc}</p>
					</div>
				</div>
			{/each}
		</div>
	{/snippet}

	{#snippet footer()}
		<p class="text-[10px] text-slate-400 leading-relaxed">
			Colors highlight individual characters using the CSS Custom Highlight API, preserving Arabic calligraphy and ligatures.
		</p>
	{/snippet}
</Dialog>
