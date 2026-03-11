<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import Parchment from "$lib/components/parchment/Parchment.svelte";
    import TypstPreview from "$lib/components/editor/TypstPreview.svelte";
    import JuliaReplPane from "$lib/components/editor/JuliaReplPane.svelte";
    import SurahWidget from "$lib/components/widgets/surah_ayah/SurahWidget.svelte";
    import EditorToolbar from "$lib/components/widgets/editor/EditorToolbar.svelte";
    import Sidebar from "$lib/components/sidebar/Sidebar.svelte";
    import {
        isSidebar,
        surahOrientation,
        surahLabels,
        selectedSurahName,
        hideSurahPage,
    } from "$lib/stores/quran.svelte";
    import type { SurahLabel } from "$lib/stores/quran.svelte";
    import { typstMode } from "$lib/stores/editor.store";
    import { activeTab, activeTabId } from "$lib/stores/tabs.store";
    import { splitJuliaTabId } from "$lib/stores/julia-terminal.store";

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

    // Julia REPL side-panel mode: active tab is julia AND hideSurahPage is on
    let juliaReplMode = $derived($hideSurahPage() && $activeTab?.type === 'julia');
</script>

<svelte:window bind:innerHeight={height} />
<div class="w-[95%] max-w-375 relative mx-auto p-0 sm:py-6">
    <div
        class={`flex ${$surahOrientation()} ${$isSidebar ? "bg-white dark:bg-[#232634] " : ""} flex-row justify-center`}
        style:height="{height - 47}px"
    >
        {#if juliaReplMode}
            <!-- Julia REPL panel on the right (or left in RTL layout) -->
            {#if $splitJuliaTabId}
                <!-- Split: two REPL panes stacked -->
                <div class="flex flex-col flex-1 min-h-0 p-2 gap-2">
                    <div class="flex-1 min-h-0 flex flex-col">
                        <JuliaReplPane tabId={$activeTabId ?? ''} />
                    </div>
                    <div class="flex-1 min-h-0 flex flex-col">
                        <JuliaReplPane tabId={$splitJuliaTabId} />
                    </div>
                </div>
            {:else}
                <!-- Single REPL pane -->
                <div class="flex-1 min-h-0 flex flex-col p-2">
                    <JuliaReplPane tabId={$activeTabId ?? ''} />
                </div>
            {/if}
        {:else if $hideSurahPage() && $typstMode}
            <TypstPreview />
        {:else}
            <Parchment />
        {/if}
        <Sidebar />
    </div>
</div>
<SurahWidget />
<EditorToolbar />
