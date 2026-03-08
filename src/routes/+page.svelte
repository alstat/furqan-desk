<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import Parchment from "$lib/components/parchment/Parchment.svelte";
    import SurahWidget from "$lib/components/widgets/surah_ayah/SurahWidget.svelte";
    import EditorToolbar from "$lib/components/widgets/editor/EditorToolbar.svelte";
    import Sidebar from "$lib/components/sidebar/Sidebar.svelte";
    import {
        isSidebar,
        surahOrientation,
        surahLabels,
        selectedSurahName,
    } from "$lib/stores/quran.svelte";
    import type { SurahLabel } from "$lib/stores/quran.svelte";

    let height: number = $state(10);

    onMount(async () => {
        try {
            const labels = await invoke<SurahLabel[]>("get_surah_labels");
            surahLabels.set(labels);
            selectedSurahName.set(labels[0]?.ar ?? "");
        } catch (error) {
            console.error(
                "Failed to load surah labels:",
                error instanceof Error ? error.message : error,
            );
        }
    });
</script>

<svelte:window bind:innerHeight={height} />
<div class="w-[95%] max-w-375 relative mx-auto p-0 sm:py-6">
    <div
        class={`flex ${$surahOrientation()} ${$isSidebar ? "bg-white " : ""} flex-row justify-center`}
        style:height="{height - 47}px"
    >
        <Parchment />
        <Sidebar />
    </div>
</div>
<SurahWidget />
<EditorToolbar />
