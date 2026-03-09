<script lang="ts">
    import { slide } from 'svelte/transition';
    import type { Dir } from '$lib/functions/utils/utils';
    import { selectedSurahName, enSurahName } from '$lib/stores/quran.svelte';
    import { morphFontFamily, morphFontSize } from '$lib/stores/morphology.store';
    let { children, title, isTafsirTrans = false, isOpen = true, dir = "ltr" as Dir } = $props()
</script>

<div class="shadow-md flex flex-col rounded-md">
    <button
        class="cursor-pointer flex items-center justify-between text-sm p-1 border border-amber-300 hover:bg-opacity-10 bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 text-lime-900"
        onclick={() => isOpen = !isOpen}
    >
        <div class="flex items-center gap-2">
            {#if isOpen}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            {:else}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 18l6-6-6-6"/>
                </svg>
            {/if}
            <span class="font-base italic">
                {title} {#if isTafsirTrans}
                <span class={`${$morphFontFamily} pr-1`}>{$selectedSurahName}</span> ({$enSurahName})
            {/if}
            </span>
        </div>
    </button>

    {#if isOpen}
        <div dir="{dir}" class={`${$morphFontSize == 'text-base' ? 'text-xs' : $morphFontSize == 'text-xl' ? 'text-lg' : 'text-xl'} default-scroll max-h-96 overflow-auto font-base border border-1 border-t-0 border-amber-300 text-sm p-2`} transition:slide={{ duration: 300 }}>
            {@render children()}
        </div>
    {/if}
</div>
