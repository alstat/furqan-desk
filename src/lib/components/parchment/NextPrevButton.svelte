<script lang="ts">
    import Icon from "@iconify/svelte";
    import { selectedSurahIdx } from "$lib/stores/quran.svelte";

    let { position = "block" } = $props();

    function goToSurah(idx: number) {
        selectedSurahIdx.set(idx);
    }

    const btnBase =
        "flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition-all cursor-pointer";
    const btnActive = `${btnBase} border-slate-200 bg-white/90 text-slate-600 hover:bg-white hover:shadow-md hover:text-slate-800 active:scale-95 backdrop-blur-sm cursor-pointer`;
    const btnDisabled = `${btnBase} border-slate-100 bg-white/60 text-slate-300 cursor-not-allowed cursor-pointer`;
</script>

<div class={position}>
    <div
        class="flex flex-row items-center justify-center gap-3"
    >
        {#if $selectedSurahIdx === 114}
            <button title="No next surah" disabled class={btnDisabled}>
                <Icon icon="solar:skip-previous-line-duotone" width="1rem" />
            </button>
        {:else}
            <button
                onclick={() => goToSurah($selectedSurahIdx + 1)}
                title="Next Surah"
                class={btnActive}
            >
                <Icon icon="solar:skip-previous-line-duotone" width="1rem" />
            </button>
        {/if}

        {#if $selectedSurahIdx === 1}
            <button title="No previous surah" disabled class={btnDisabled}>
                <Icon icon="solar:skip-next-line-duotone" width="1rem" />
            </button>
        {:else}
            <button
                onclick={() => goToSurah($selectedSurahIdx - 1)}
                title="Previous Surah"
                class={btnActive}
            >
                <Icon icon="solar:skip-next-line-duotone" width="1rem" />
            </button>
        {/if}
    </div>
</div>
