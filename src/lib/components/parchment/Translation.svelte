<script lang="ts">
	import CollapsibleSection from '../shared/CollapsibleSection.svelte';
	import {
		surahTranslation,
		basmallahTrans,
		selectedSurahIdx,
	} from '$lib/stores/quran.svelte';
</script>

<CollapsibleSection title="Translation of " isTafsirTrans={true}>
    <div class="text-justify max-w-[600px]">
        {#each $surahTranslation as formItem, idx}
            {#if idx == 0 && $selectedSurahIdx != 1 && $selectedSurahIdx != 9}
                <div class="inline cursor-pointer hover:bg-yellow-200">
                    {$basmallahTrans}
                    {formItem}
                </div>
            {:else}
                <div class="inline cursor-pointer hover:bg-yellow-200">
                    {formItem}
                </div>
            {/if}
            <div class="inline p-1 font-scheherazade text-lime-700">
                ({idx + 1})
            </div>
        {/each}
    </div>
</CollapsibleSection>
