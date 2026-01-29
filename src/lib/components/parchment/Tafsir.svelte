<script lang="ts">
	import CollapsibleSection from '../shared/CollapsibleSection.svelte';
	import {
		fontFamily,
		surahTafsir
	} from '$lib/stores/quran.svelte';
	import { convertToArabicNumbers } from '$lib/functions/utils/utils';
</script>

<CollapsibleSection title="Tafsir of " isTafsirTrans={true} dir="rtl">
    <div class={`text-justify` + " max-w-[600px]"}>
        <ol class={`space-y-4 ${$fontFamily()}`}>
            {#each $surahTafsir as tafsirItem, tafsirIdx}
                <li dir="rtl" class="cursor-pointer hover:bg-yellow-200">
                    <span class="text-lime-700 pl-1">({convertToArabicNumbers(tafsirIdx+1)})</span>{tafsirItem}
                </li>
            {/each}
        </ol>
    </div>
</CollapsibleSection>