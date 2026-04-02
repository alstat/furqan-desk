<script lang="ts">
    import Icon from "@iconify/svelte";
    import { selectedSurahIdx } from "$lib/stores/quran.svelte";
    import { zenMode } from "$lib/stores/editor.store";

    let { position = "block" } = $props();

    function goToSurah(idx: number) {
        selectedSurahIdx.set(idx);
    }

    const btnBase =
        "flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition-all cursor-pointer";
    const btnActive = `${btnBase} border-brand-sand-200 bg-brand-sand-50/90 text-brand-charcoal-500 hover:bg-brand-sand-100 hover:shadow-md hover:text-brand-charcoal-900 active:scale-95 backdrop-blur-sm cursor-pointer`;
    const btnDisabled = `${btnBase} border-brand-sand-100 bg-brand-sand-50/60 text-brand-charcoal-100 cursor-not-allowed cursor-pointer`;
</script>

<div class={position}>
    <div
        class="{$zenMode
            ? 'opacity-0 hover:opacity-100 transition-opacity duration-200'
            : ''} flex flex-row items-center justify-center gap-3"
    >
        {#if $selectedSurahIdx === 114}
            <button title="No next surah" disabled class={btnDisabled}>
                <Icon icon="solar:arrow-left-bold-duotone" width="1rem" />
            </button>
        {:else}
            <button
                onclick={() => goToSurah($selectedSurahIdx + 1)}
                title="Next Surah"
                class={btnActive}
            >
                <Icon icon="solar:arrow-left-bold-duotone" width="1rem" />
            </button>
        {/if}

        {#if $selectedSurahIdx === 1}
            <button title="No previous surah" disabled class={btnDisabled}>
                <Icon icon="solar:arrow-right-bold-duotone" width="1rem" />
            </button>
        {:else}
            <button
                onclick={() => goToSurah($selectedSurahIdx - 1)}
                title="Previous Surah"
                class={btnActive}
            >
                <Icon icon="solar:arrow-right-bold-duotone" width="1rem" />
            </button>
        {/if}
    </div>
</div>
