<script lang="ts">
	import Icon from '@iconify/svelte';
	import ControlCard from '../cards/ControlCard.svelte';
	import GroupCards from '../cards/GroupCards.svelte';
	import {
		surah,
		surahTranslation,
		selectedSurahName,
		selectedSurahIdx,
		fontFamily,
		fontSize,
		surahOrientation,
		surahTafsir,
		enSurahName,
		surahTemplate,
		onLoadPayload,
		defaultTranslation,
		defaultTafsir,
		displayMode,
		type DisplayMode
	} from '$lib/stores/quran.svelte';

	import { handleSurahChange, handleTafsirChange, handleDisplayModeChange } from '$lib/functions/widgets/surahWidget';
	import { handleTranslationChange } from '$lib/functions/widgets/surahWidget';
	import Toggle from './Toggle.svelte';
	import { selectBtnStyle } from '$lib/data/toolbar/toolbar';

	let font: string = $state('font-amiri');
	let textSize: string = $state('text-xl');
	let surahLocation: string = $state('flex-row-reverse');
	let pageTemplate: string = $state('ayah-only');
	let translation: string = $state($defaultTranslation);
	let tafsir: string = $state($defaultTafsir);
	let currentDisplayMode: DisplayMode = $state('standard');

	function onDisplayModeChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		currentDisplayMode = target.value as DisplayMode;
		handleDisplayModeChange(currentDisplayMode);
	}

	fontFamily.set(() => font);
	fontSize.set(() => textSize);
	surahOrientation.set(() => surahLocation);
	surahTemplate.set(() => pageTemplate);
	console.log($onLoadPayload);
</script>

{#snippet surahCardBody()}
	<div class="flex flex-col">
		<div class="grid grid-cols-2 justify-center space-x-1 p-4">
			<div class="flex flex-col justify-items-center space-y-5">
				<div>Surah</div>
				<div>Translation</div>
				<div>Tafsir</div>
			</div>
			<div class="flex flex-col space-y-2">
				<form class="block" action="/rest/load_quran" method="POST">
					<select
						name="surah-idx"
						id="surah-idx"
						onchange={handleSurahChange}
						class=" w-36 cursor-pointer rounded-md border border-slate-300 bg-slate-100 p-1 text-center font-scheherazade text-sm text-lime-700"
					>
						{#each $onLoadPayload.ar_labels as aLab, i}
							{#if $selectedSurahIdx - 1 != i}
								<option class="" value={`${i + 1}`} title={$onLoadPayload.en_labels[i]}
									>{aLab}</option
								>
							{:else}
								<option class="" value={`${i + 1}`} title={$onLoadPayload.en_labels[i]} selected
									>{aLab}</option
								>
							{/if}
						{/each}
					</select>
				</form>

				<form action="/rest/translate" method="POST">
					<select
						name="surah-translation"
						id="surah-translation"
						onchange={handleTranslationChange}
						bind:value={translation}
						class={selectBtnStyle + ' w-36'}
					>
						{#each $onLoadPayload.list_translations as transLab, i}
							<option class="" value={transLab}>{transLab}</option>
						{/each}
					</select>
				</form>

				<form action="/rest/tafsir" method="POST">
					<select
						name="surah-tafsir"
						id="surah-tafsir"
						onchange={handleTafsirChange}
						bind:value={tafsir}
						class={selectBtnStyle + ' w-36'}
					>
						{#each $onLoadPayload.list_tafsir as tafsirLab, i}
							<option class="" value={tafsirLab}>{tafsirLab}</option>
						{/each}
					</select>
				</form>
			</div>
		</div>
		<hr />
		<div class="grid grid-cols-2 justify-center space-x-1 p-4">
			<div class="flex flex-col justify-items-center space-y-5">
				<div>Layout</div>
				<div>Orientation</div>
				<div>Data Source</div>
			</div>

			<div class="flex flex-col space-y-2">
				<select
					bind:value={pageTemplate}
					name="tafsir"
					id="tafsir"
					class={selectBtnStyle + ' w-36'}
				>
					<option value="ayah-only" selected>Ayah Only</option>
					<option value="ayah-with-translation">Ayah w/ Translation</option>
					<option value="ayah-with-tafsir">Ayah w/ Tafsir</option>
					<option value="separated-sections">Separated Sections</option>
				</select>
				<select
					bind:value={surahLocation}
					name="tafsir"
					id="tafsir"
					class={selectBtnStyle + ' w-36'}
				>
					<option value="flex-row-reverse">Right</option>
					<option value="flex-row">Left</option>
				</select>
				<select
					bind:value={currentDisplayMode}
					onchange={onDisplayModeChange}
					class={selectBtnStyle + ' w-36'}
				>
					<option value="standard">Standard</option>
					<option value="morphological">Morphological</option>
				</select>
			</div>
		</div>
	</div>
{/snippet}

{#snippet fontBody()}
	<div class="grid grid-cols-2 space-x-1 p-4">
		<div class="flex flex-col justify-items-center space-y-5">
			<div>Font Family</div>
			<div>Font Size</div>
		</div>
		<div class="flex flex-col space-y-2">
			<select
				bind:value={font}
				name="tafsir"
				id="tafsir"
				class={selectBtnStyle + ' w-36'}
			>
				<option value="font-scheherazade">Scheherazade</option>
				<option value="font-amiri" selected>Amiri Qur'an</option>
			</select>
			<select
				bind:value={textSize}
				name="tafsir"
				id="tafsir"
				class={selectBtnStyle + ' w-36'}
			>
				<option value="text-base">Small</option>
				<option value="text-xl" selected>Medium</option>
				<option value="text-3xl">Large</option>
			</select>
		</div>
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
