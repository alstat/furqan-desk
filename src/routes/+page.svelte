<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import Parchment from "$lib/components/parchment/Parchment.svelte";
    import JuliaReplPane from "$lib/components/editor/JuliaReplPane.svelte";
    import TypstPreview from "$lib/components/editor/TypstPreview.svelte";
    import TypstEditor from "$lib/components/editor/TypstEditor.svelte";
    import RichTextEditor from "$lib/components/editor/EditorComposer.svelte";
    import JuliaEditor from "$lib/components/editor/JuliaEditor.svelte";
    import SurahWidget from "$lib/components/widgets/surah_ayah/SurahWidget.svelte";
    import EditorToolbar from "$lib/components/widgets/editor/EditorToolbar.svelte";
    import Sidebar from "$lib/components/sidebar/Sidebar.svelte";
    import TourOverlay from "$lib/components/tour/TourOverlay.svelte";
    import SplashScreen from "$lib/components/shared/SplashScreen.svelte";
    import UpdateToast from "$lib/components/shared/UpdateToast.svelte";
    import NewBlogToast from "$lib/components/shared/NewBlogToast.svelte";
    import JuliaPlotViewer from "$lib/components/shared/JuliaPlotViewer.svelte";
    import SettingsDialog from "$lib/components/settings/SettingsDialog.svelte";
    import CustomFontDialog from "$lib/components/settings/CustomFontDialog.svelte";
    import {
        customFontDialogOpen,
        closeCustomFontDialog,
    } from "$lib/stores/custom-font-dialog.store";
    import ManuscriptViewer from "$lib/components/manuscripts/ManuscriptViewer.svelte";
    import {
        manuscriptViewerOpen,
        manuscriptDemoOpen,
    } from "$lib/stores/manuscripts.store";
    import {
        isSidebar,
        surahOrientation,
        surahLabels,
        selectedSurahName,
        hideSurahPage,
    } from "$lib/stores/quran.svelte";
    import type { SurahLabel } from "$lib/stores/quran.svelte";
    import { activeTab, activeTabId, tabs } from "$lib/stores/tabs.store";
    import { crossGroups } from "$lib/stores/julia-terminal.store";
    import type { CrossGroup } from "$lib/stores/julia-terminal.store";
    import {
        lexicalEditorInstance,
        singlePageMargin,
    } from "$lib/stores/editor.store";
    import { get } from "svelte/store";
    import { checkFirstRun } from "$lib/stores/tour.store";
    import { zenMode, appDarkMode } from "$lib/stores/editor.store";
    import SukunPeekToggle from "$lib/components/shared/SukunPeekToggle.svelte";
    import UpDownMargin from "$lib/components/shared/UpDownMargin.svelte";
    import SplitDivider from "$lib/components/shared/SplitDivider.svelte";

    let height: number = $state(
        typeof window !== "undefined" ? window.innerHeight : 600,
    );
    let showSettings = $state(false);
    let isLoading = $state(true);

    onMount(async () => {
        try {
            const [labels] = await Promise.all([
                invoke<SurahLabel[]>("get_surah_labels"),
                new Promise<void>((resolve) => setTimeout(resolve, 1400)),
            ]);
            surahLabels.set(labels);
            selectedSurahName.set(labels[0]?.ar ?? "");
        } catch (error) {
            console.error(
                "Failed to load surah labels:",
                error instanceof Error ? error.message : error,
            );
        } finally {
            isLoading = false;
        }
        checkFirstRun();
    });

    // Cross-type group involving the active tab (any editor type can be host or partner)
    let activeCrossGroup = $derived(
        $hideSurahPage()
            ? ($crossGroups.find(
                  (g: CrossGroup) =>
                      g.hostTabId === $activeTabId ||
                      g.partnerTabId === $activeTabId,
              ) ?? null)
            : null,
    );

    // Julia REPL side-panel mode: active tab is julia AND hideSurahPage is on
    // Excluded when in a cross-type pair (REPL is embedded in sidebar in that case)
    let juliaReplMode = $derived(
        $hideSurahPage() && $activeTab?.type === "julia" && !activeCrossGroup,
    );
    let typstMode = $derived(
        $hideSurahPage() && $activeTab?.type === "typst" && !activeCrossGroup,
    );

    // Lexical state management for Julia+Lexical cross-type mode
    const emptyLexicalState =
        '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

    // Load the Lexical partner tab's content when host is active (partner is on the left panel)
    $effect(() => {
        const cg = activeCrossGroup;
        const editor = $lexicalEditorInstance;
        if (!cg || !editor) return;
        const partnerTab = get(tabs).find((t) => t.id === cg.partnerTabId);
        if (!partnerTab || partnerTab.type !== "lexical") return;
        if ($activeTabId === cg.partnerTabId) return; // partner is active — Sidebar effects handle it
        try {
            const parsed = JSON.parse(partnerTab.content || emptyLexicalState);
            const stateData = parsed.editorState ?? parsed;
            editor.setEditorState(
                editor.parseEditorState(JSON.stringify(stateData)),
                { tag: 'history-merge' },
            );
        } catch {
            /* ignore */
        }
    });

    // Auto-save Lexical partner tab content on every change when host is active
    $effect(() => {
        const cg = activeCrossGroup;
        const editor = $lexicalEditorInstance;
        if (!cg || !editor) return;
        const partnerTab = get(tabs).find((t) => t.id === cg.partnerTabId);
        if (!partnerTab || partnerTab.type !== "lexical") return;
        if ($activeTabId === cg.partnerTabId) return; // partner is active — normal save applies
        const lexicalTabId = cg.partnerTabId;
        const unregister = editor.registerUpdateListener(
            ({ dirtyElements, dirtyLeaves, tags }) => {
                if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
                if (tags.has('history-merge')) return;
                const json = JSON.stringify(editor.getEditorState().toJSON());
                tabs.update((ts) =>
                    ts.map((t) =>
                        t.id === lexicalTabId
                            ? { ...t, content: json, isDirty: true }
                            : t,
                    ),
                );
            },
        );
        return unregister;
    });
</script>

<svelte:window bind:innerHeight={height} />
<div
    class="max-w-[95%] rounded-r-md relative mx-auto sm:py-6"
    style:width="{Math.round(($singlePageMargin / 12) * 100)}%"
>
    <div
        class={`flex rounded-r-md ${$surahOrientation()} ${$isSidebar && !$zenMode ? "bg-white dark:bg-[#232634] " : ""} flex-row justify-center`}
        style:height="{height - 47}px"
    >
        {#if activeCrossGroup}
            {@const partnerTab = $tabs.find(
                (t) => t.id === activeCrossGroup.partnerTabId,
            )}
            <div
                class="relative z-1 px-1 flex flex-col flex-1 min-w-0 rounded-r-md
                        {$zenMode
                    ? ''
                    : 'border border-stone-200 dark:border-[#414559] sm:shadow-xl sm:shadow-slate-200/60 dark:sm:shadow-black/30 bg-white dark:bg-[#303446]'}"
            >
                {#if partnerTab?.type === "julia"}
                    <!-- Partner=Julia: left = JuliaEditor with embedded REPL -->
                    <JuliaEditor
                        tabId={activeCrossGroup.partnerTabId}
                        hideRepl={false}
                    />
                {:else if partnerTab?.type === "typst"}
                    <!-- Partner=Typst: use TypstEditor's own resizable inline preview -->
                    <TypstEditor
                        tabId={activeCrossGroup.partnerTabId}
                        inCrossHost={true}
                    />
                {:else if partnerTab?.type === "lexical"}
                    <!-- Partner=Lexical: left = LexicalEditor full-height -->
                    <RichTextEditor />
                {/if}
            </div>
        {:else if juliaReplMode}
            <!-- Julia REPL panel on the right (or left in RTL layout) — shared by all tabs -->
            <div
                class="relative z-1 flex flex-col items-center
                        flex-1 min-w-0 rounded-r-md
                        {$zenMode
                    ? ''
                    : 'border border-stone-200 dark:border-[#414559] sm:shadow-xl sm:shadow-slate-200/60 dark:sm:shadow-black/30 bg-white dark:bg-[#303446]'}"
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
        {:else if typstMode}
            <div
                class="flex-1 min-w-0 h-full flex flex-col sm:shadow-xl sm:shadow-slate-200/60 dark:sm:shadow-black/30"
            >
                <TypstPreview embedded={true} />
            </div>
        {/if}
        <!-- Parchment stays mounted (hidden) in the alternate modes so the
             recitation audio and its floating mini player keep running. -->
        <div
            class="flex-1 min-w-0 h-full {activeCrossGroup ||
            juliaReplMode ||
            typstMode
                ? 'hidden'
                : ''}"
        >
            <Parchment />
        </div>
        {#if $zenMode && $isSidebar}
            <div
                class="self-stretch flex-shrink-0 w-px relative"
                style="background: linear-gradient(to bottom, transparent 0%, {$appDarkMode
                    ? 'rgba(229,200,144,0.25)'
                    : 'rgba(229,200,144,0.55)'} 20%, {$appDarkMode
                    ? 'rgba(229,200,144,0.25)'
                    : 'rgba(229,200,144,0.55)'} 80%, transparent 100%)"
            >
                <SukunPeekToggle />
            </div>
        {/if}
        {#if (juliaReplMode || typstMode) && $isSidebar}
            <SplitDivider />
        {/if}
        <Sidebar />
    </div>
</div>
<UpDownMargin />
<SurahWidget />
<EditorToolbar onOpenSettings={() => (showSettings = true)} />
<TourOverlay />
<SettingsDialog
    open={showSettings}
    onClose={() => (showSettings = false)}
/>
<CustomFontDialog
    open={$customFontDialogOpen}
    onClose={closeCustomFontDialog}
/>
<ManuscriptViewer
    open={$manuscriptViewerOpen}
    onClose={() => manuscriptViewerOpen.set(false)}
/>
<ManuscriptViewer
    open={$manuscriptDemoOpen}
    onClose={() => manuscriptDemoOpen.set(false)}
    demoMode={true}
/>
<SplashScreen visible={isLoading} />
<UpdateToast />
<NewBlogToast />
<JuliaPlotViewer />
