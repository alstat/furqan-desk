<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import NextPrevButton from "./NextPrevButton.svelte";
    import {
        fontSize,
        hideSurahPage,
        isSidebar,
        surahOrientation,
        surahTemplate,
        displayMode,
    } from "$lib/stores/quran.svelte";
    import Icon from "@iconify/svelte";
    import SeparatedContents from "./SeparatedContents.svelte";
    import AyahWithTranslation from "./AyahWithTranslation.svelte";
    import AyahWithTafsir from "./AyahWithTafsir.svelte";
    import AyahOnly from "./AyahOnly.svelte";
    import MorphologyView from "./MorphologyView.svelte";

    interface Ayah {
        id: number;
        sura: number;
        aya: number;
        text: string;
    }

    let ayahs: Ayah[] = [];
    let selectedSurah = 1;
    let loading = false;

    async function loadSurah(surahNumber: number) {
        loading = true;
        try {
            ayahs = await invoke<Ayah[]>("get_surah", { surahNumber });
            console.log(`Loaded Surah ${surahNumber}:`, ayahs);
        } catch (error) {
            console.error("Failed to load surah:", error);
            ayahs = [];
        } finally {
            loading = false;
        }
    }

    function handleSurahChange(event: Event) {
        const target = event.target as HTMLSelectElement;
        selectedSurah = parseInt(target.value);
        loadSurah(selectedSurah);
    }

    onMount(async () => {
        await loadSurah(selectedSurah);
    });
</script>

<div
    class={`${$hideSurahPage() ? "hidden " : ""} vintage-scroll z-10 flex flex-col items-center overflow-auto bg-amber-50 px-14 py-10 text-justify sm:w-full md:w-9/12 lg:w-6/12 ${$fontSize()} leading-loose text-amber-800  ${$isSidebar ? "" : "sm:shadow-xl"}`}
>
    <!-- Surah Selector -->
    <div class="mb-6 w-full">
        <label for="surah-select" class="mb-2 block font-semibold text-amber-900">
            Select Surah:
        </label>
        <select
            id="surah-select"
            bind:value={selectedSurah}
            on:change={handleSurahChange}
            class="w-full rounded border border-amber-300 bg-amber-100 px-4 py-2 text-amber-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
            {#each Array.from({ length: 114 }, (_, i) => i + 1) as surahNum}
                <option value={surahNum}>Surah {surahNum}</option>
            {/each}
        </select>
    </div>

    <!-- Loading State -->
    {#if loading}
        <div class="my-8 text-center text-amber-700">Loading...</div>
    {/if}

    <!-- Ayahs Display -->
    {#if $displayMode === 'morphological'}
        <MorphologyView />
    {:else if !loading && ayahs.length > 0}
        <div class="w-full space-y-4">
            {#each ayahs as ayah}
                <div class="rounded bg-amber-100 p-4 shadow-sm">
                    <div class="mb-2 text-right text-2xl leading-loose">
                        {ayah.text}
                    </div>
                    <div class="text-sm text-amber-600">
                        Ayah {ayah.aya}
                    </div>
                </div>
            {/each}
        </div>
    {:else if !loading && ayahs.length === 0}
        <div class="my-8 text-center text-amber-700">No data available</div>
    {/if}
    <!-- {#if $surahTemplate() == "separated-sections"}
        <SeparatedContents />
    {:else if $surahTemplate() == "ayah-with-translation"}
        <AyahWithTranslation />
    {:else if $surahTemplate() == "ayah-with-tafsir"}
        <AyahWithTafsir />
    {:else}
        <AyahOnly />
    {/if} -->

    <NextPrevButton position={"absolute -bottom-12 sm:bottom-2 z-10"} />
</div>
