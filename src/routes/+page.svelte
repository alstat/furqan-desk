<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import Parchment from "$lib/components/parchment/Parchment.svelte";
    import TypstPreview from "$lib/components/editor/TypstPreview.svelte";
    import JuliaReplPane from "$lib/components/editor/JuliaReplPane.svelte";
    import SurahWidget from "$lib/components/widgets/surah_ayah/SurahWidget.svelte";
    import EditorToolbar from "$lib/components/widgets/editor/EditorToolbar.svelte";
    import Sidebar from "$lib/components/sidebar/Sidebar.svelte";
    import TourOverlay from "$lib/components/tour/TourOverlay.svelte";
    import SettingsDialog from "$lib/components/settings/SettingsDialog.svelte";
    import HelpDialog from "$lib/components/help/HelpDialog.svelte";
    import ManuscriptViewer from "$lib/components/manuscripts/ManuscriptViewer.svelte";
    import { manuscriptViewerOpen, manuscriptDemoOpen } from "$lib/stores/manuscripts.store";
    import {
        isSidebar,
        surahOrientation,
        surahLabels,
        selectedSurahName,
        hideSurahPage,
    } from "$lib/stores/quran.svelte";
    import type { SurahLabel } from "$lib/stores/quran.svelte";
    import { typstMode } from "$lib/stores/editor.store";
    import { activeTab } from "$lib/stores/tabs.store";
    import { checkFirstRun } from "$lib/stores/tour.store";

    let height: number = $state(typeof window !== 'undefined' ? window.innerHeight : 600);
    let showSettings = $state(false);
    let showHelp = $state(false);

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
        checkFirstRun();
    });

    // Julia REPL side-panel mode: active tab is julia AND hideSurahPage is on
    let juliaReplMode = $derived(
        $hideSurahPage() && $activeTab?.type === "julia",
    );
</script>

<svelte:window bind:innerHeight={height} />
<div class="w-[95%] rounded-r-md max-w-375 relative mx-auto p-0 sm:py-6">
    <div
        class={`flex rounded-r-md ${$surahOrientation()} ${$isSidebar ? "bg-white dark:bg-[#232634] " : ""} flex-row justify-center`}
        style:height="{height - 47}px"
    >
        {#if juliaReplMode}
            <!-- Julia REPL panel on the right (or left in RTL layout) — shared by all tabs -->
            <div
                class="relative z-1 flex flex-col items-center bg-white dark:bg-[#303446]
                        sm:w-full md:w-9/12 lg:w-6/12 border border-stone-200 dark:border-[#414559]
                        sm:shadow-xl sm:shadow-slate-200/60 dark:sm:shadow-black/30 rounded-r-md"
            >
                <div
                    class=" mb-5
                            w-full flex-1 flex flex-col min-h-0 pt-1 pb-2 px-3 overflow-hidden"
                >
                    <div
                        class="flex items-center justify-between px-1 pb-1 shrink-0"
                    >
                        <span
                            class="text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300"
                        >
                            Terminal
                        </span>
                    </div>
                    <JuliaReplPane />
                </div>
            </div>
        {:else if $hideSurahPage() && $typstMode}
            <TypstPreview />
        {:else}
            <Parchment />
        {/if}
        <Sidebar />
    </div>
</div>
<SurahWidget />
<EditorToolbar onOpenSettings={() => (showSettings = true)} />
<TourOverlay />
<SettingsDialog open={showSettings} onClose={() => (showSettings = false)} onOpenHelp={() => (showHelp = true)} />
<HelpDialog open={showHelp} onClose={() => (showHelp = false)} />
<ManuscriptViewer open={$manuscriptViewerOpen} onClose={() => manuscriptViewerOpen.set(false)} />
<ManuscriptViewer open={$manuscriptDemoOpen} onClose={() => manuscriptDemoOpen.set(false)} demoMode={true} />
