<script lang="ts">
	import Icon from '@iconify/svelte';
	import { selectedSurahIdx } from '$lib/stores/quran.svelte';
	import { handleSurahChange } from '$lib/functions/widgets/surahWidget';
	let { position = 'block' } = $props();
</script>

<div class={position}>
	<div class="flex flex-row justify-center space-x-5 pt-5">
		{#if $selectedSurahIdx == 114}
			<button
				title="No next surah"
				class="shadow-md cursor-not-allowed bg-gray-100 p-2 text-xs rounded-full text-gray-400 hover:bg-gray-300 hover:text-lime-50 active:bg-gray-300"
			>
				<Icon icon="solar:skip-previous-line-duotone" width="1rem" />
			</button>
		{:else}
			<button
				onclick={(e: Event) => handleSurahChange(e, $selectedSurahIdx + 1, '/rest/load_quran')}
				title="Previous Surah"
				class="shadow-md p-2 text-xs rounded-full text-lime-700 bg-amber-200 hover:bg-amber-300 active:bg-amber-400"
			>
				<Icon icon="solar:skip-previous-line-duotone" width="1rem" />
			</button>
		{/if}

		{#if $selectedSurahIdx == 1}
			<button
				title="No previous surah"
				class="shadow-md cursor-not-allowed bg-gray-200 p-2 text-xs rounded-full text-gray-400 hover:bg-gray-300 hover:text-lime-50 active:bg-gray-300"
			>
				<Icon icon="solar:skip-next-line-duotone" width="1rem" />
			</button>
		{:else}
			<button
				onclick={(e: Event) => handleSurahChange(e, $selectedSurahIdx - 1, '/rest/load_quran')}
				title="Next Surah"
				class="shadow-md bg-amber-200 p-2 text-xs rounded-full text-lime-700 font-bold hover:bg-amber-300 active:bg-amber-400"
			>
				<Icon icon="solar:skip-next-line-duotone" width="1rem" />
			</button>
		{/if}
	</div>
</div>
