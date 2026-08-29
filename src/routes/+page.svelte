<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import Parchment from "$lib/components/parchment/Parchment.svelte";
    import JuliaReplPane from "$lib/components/editor/JuliaReplPane.svelte";
    import TypstPreview from "$lib/components/editor/TypstPreview.svelte";
    import TypstEditor from "$lib/components/editor/TypstEditor.svelte";
    import RichTextEditor from "$lib/components/editor/EditorComposer.svelte";
    import JuliaEditor from "$lib/components/editor/JuliaEditor.svelte";
    import LeanEditor from "$lib/components/editor/LeanEditor.svelte";
    import LeanInfoviewPane from "$lib/components/editor/LeanInfoviewPane.svelte";
    import SurahWidget from "$lib/components/widgets/surah_ayah/SurahWidget.svelte";
    import EditorToolbar from "$lib/components/widgets/editor/EditorToolbar.svelte";
    import Sidebar from "$lib/components/sidebar/Sidebar.svelte";
    import TourOverlay from "$lib/components/tour/TourOverlay.svelte";
    import AnimationChoiceDialog from "$lib/components/tour/AnimationChoiceDialog.svelte";
    import SplashScreen from "$lib/components/shared/SplashScreen.svelte";
    import UpdateToast from "$lib/components/shared/UpdateToast.svelte";
    import NewBlogToast from "$lib/components/shared/NewBlogToast.svelte";
    import TypstDarkModeToast from "$lib/components/shared/TypstDarkModeToast.svelte";
    import JuliaPlotViewer from "$lib/components/shared/JuliaPlotViewer.svelte";
    import { installPlotSync } from "$lib/stores/julia-plot-window";
    import { installReaderSnapshotHost } from "$lib/stores/reader-windows.store";
    import { installManuscriptInsertHost } from "$lib/stores/manuscripts.store";
    import { installDrawingSaveHost } from "$lexical/core/plugins/Drawing/drawingEditorStore";
    import { installTerminalCwdHost } from "$lib/stores/terminal-window.store";
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
    import {
        crossGroups,
        juliaGroups,
        leanGroups,
        typstGroups,
    } from "$lib/stores/julia-terminal.store";
    import type {
        CrossGroup,
        JuliaGroup,
        LeanGroup,
        TypstGroup,
    } from "$lib/stores/julia-terminal.store";
    import {
        lexicalEditorInstance,
        singlePageMargin,
        juliaRightSplitRatio,
        leanRightSplitRatio,
        typstRightSplitRatio,
        codeMirrorViewsByTab,
        codeMirrorViewInstance,
    } from "$lib/stores/editor.store";
    import { leanEditorRuntime } from "$lib/stores/lean-compiler.store";
    import { syncLexicalEditorToTab } from "$lib/utils/lexicalTabSync";
    import StackSplitDivider from "$lib/components/shared/StackSplitDivider.svelte";
    import { get } from "svelte/store";
    import { checkFirstRun, tourActive } from "$lib/stores/tour.store";
    import { zenMode, appDarkMode } from "$lib/stores/editor.store";
    import SukunPeekToggle from "$lib/components/shared/SukunPeekToggle.svelte";
    import UpDownMargin from "$lib/components/shared/UpDownMargin.svelte";
    import SplitDivider from "$lib/components/shared/SplitDivider.svelte";
    import QuickOpen from "$lib/components/shared/QuickOpen.svelte";
    import VerseOfDayDialog from "$lib/components/shared/VerseOfDayDialog.svelte";
    import {
        VERSE_OF_DAY_SEEN_KEY,
        localDateKey,
    } from "$lib/data/verse-of-day";
    import { verseOfDayDialogOpen } from "$lib/stores/verse-of-day.store";
    import { headerHeight } from "$lib/stores/header.store";
    import { csdMarginPx } from "$lib/stores/window-state.store";

    let height: number = $state(
        typeof window !== "undefined" ? window.innerHeight : 600,
    );
    let showSettings = $state(false);
    let isLoading = $state(true);

    // Cmd+, (macOS) / Ctrl+, (Win/Linux) opens Settings — standard convention.
    function handleGlobalKeydown(e: KeyboardEvent) {
        if ((e.metaKey || e.ctrlKey) && e.key === "," ) {
            e.preventDefault();
            showSettings = true;
        }
    }

    onMount(async () => {
        // Plots live only in this window's store; mirror them so the viewer's
        // own window sees what the REPL produces here.
        void installPlotSync();
        // The translation and tafsir readers render a view only this window can
        // derive; broadcast it so their windows can show it.
        void installReaderSnapshotHost();
        // The manuscript viewer's own window has no Lexical editor to insert
        // into; it asks this window to do it.
        void installManuscriptInsertHost();
        // The drawing editor window sends its finished scene back here,
        // where the Lexical editor it belongs in actually lives.
        void installDrawingSaveHost();
        // The terminal window starts its shells in the folder the File Explorer
        // has open; it cannot read this window's memory, so publish changes.
        installTerminalCwdHost();
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
        maybeShowVerseOfDay();
    });

    // Surface the "Verse of the Day" once per calendar day, on the first launch
    // of that day. The tour takes precedence for brand-new users, so hold off
    // while it is running.
    function maybeShowVerseOfDay() {
        try {
            const today = localDateKey();
            if (localStorage.getItem(VERSE_OF_DAY_SEEN_KEY) === today) return;
            if (get(tourActive)) return;
            localStorage.setItem(VERSE_OF_DAY_SEEN_KEY, today);
            verseOfDayDialogOpen.set(true);
        } catch {
            /* ignore storage errors */
        }
    }

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

    // Julia group whose member is the active tab — drives the third editor that
    // stacks above the REPL in the right column (the quad split layout).
    let activeJuliaGroup = $derived(
        juliaReplMode
            ? ($juliaGroups.find(
                  (g: JuliaGroup) =>
                      g.tabA === $activeTabId ||
                      g.tabB === $activeTabId ||
                      g.tabC === $activeTabId,
              ) ?? null)
            : null,
    );
    // Lean infoview side-panel mode: active tab is lean AND hideSurahPage is on.
    // Excluded when in a cross-type pair (the infoview stays embedded in the
    // sidebar then, because the left panel belongs to the partner editor).
    let leanInfoviewMode = $derived(
        $hideSurahPage() && $activeTab?.type === "lean" && !activeCrossGroup,
    );

    // Lean group whose member is the active tab — drives the third editor that
    // stacks above the infoview in the right column (the quad split layout).
    let activeLeanGroup = $derived(
        leanInfoviewMode
            ? ($leanGroups.find(
                  (g: LeanGroup) =>
                      g.tabA === $activeTabId ||
                      g.tabB === $activeTabId ||
                      g.tabC === $activeTabId,
              ) ?? null)
            : null,
    );

    // The shared infoview compiles whichever Lean tab is active, so it reads
    // its source from the tab rather than from any one mounted editor.
    function activeLeanCode(): string {
        return $activeTab?.type === "lean" ? $activeTab.content : "";
    }

    // Jump the caret to a diagnostic. With a split there are several mounted
    // editors, so address the one registered for the active tab rather than
    // whichever view happened to focus last.
    function jumpToLeanPosition(line: number, column: number) {
        const view =
            ($activeTabId ? $codeMirrorViewsByTab[$activeTabId] : null) ??
            get(codeMirrorViewInstance);
        if (!view) return;
        const lineNo = Math.max(1, Math.min(view.state.doc.lines, line));
        const docLine = view.state.doc.line(lineNo);
        const pos = Math.min(docLine.from + column, docLine.to);
        view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
        view.focus();
    }

    let typstMode = $derived(
        $hideSurahPage() && $activeTab?.type === "typst" && !activeCrossGroup,
    );

    // Typst group whose member is the active tab — drives the third editor that
    // stacks above the shared preview in the right column.
    let activeTypstGroup = $derived(
        typstMode
            ? ($typstGroups.find(
                  (g: TypstGroup) =>
                      g.tabA === $activeTabId ||
                      g.tabB === $activeTabId ||
                      g.tabC === $activeTabId,
              ) ?? null)
            : null,
    );

    // Lexical state management for Julia+Lexical cross-type mode
    const emptyLexicalState =
        '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

    // Load the Lexical partner tab's content when host is active (partner is on the left panel)
    //
    // Seeded once per (tab, editor) pair, the way Sidebar's host-side effect
    // does it. Without the guard every re-run replaced the whole editor state,
    // and `setEditorState` is not cheap on a document made of decorators — each
    // table, Qur'an block, equation and drawing is a Svelte component that
    // unmounts and remounts. Re-running is easy to provoke: the effect tracks
    // the editor instance and the cross group, both of which change when a
    // split is created, dissolved or switched, which is when the app was
    // hanging. `lastSeeded*` are plain variables on purpose — making them state
    // would put the guard itself inside the effect's dependency graph.
    let lastSeededPartnerTabId: string | null = null;
    let lastSeededPartnerEditor: unknown = null;
    $effect(() => {
        const cg = activeCrossGroup;
        const editor = $lexicalEditorInstance;
        if (!cg || !editor) {
            lastSeededPartnerTabId = null;
            lastSeededPartnerEditor = null;
            return;
        }
        const partnerTab = get(tabs).find((t) => t.id === cg.partnerTabId);
        if (!partnerTab || partnerTab.type !== "lexical") return;
        if ($activeTabId === cg.partnerTabId) return; // partner is active — Sidebar effects handle it
        if (
            lastSeededPartnerTabId === partnerTab.id &&
            lastSeededPartnerEditor === editor
        ) {
            return;
        }
        lastSeededPartnerTabId = partnerTab.id;
        lastSeededPartnerEditor = editor;
        try {
            const parsed = JSON.parse(partnerTab.content || emptyLexicalState);
            const stateData = parsed.editorState ?? parsed;
            editor.setEditorState(
                editor.parseEditorState(stateData),
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
        return syncLexicalEditorToTab(editor, cg.partnerTabId);
    });
</script>

<svelte:window bind:innerHeight={height} onkeydown={handleGlobalKeydown} />
<div
    class="max-w-[95%] relative mx-auto"
    style:width="{Math.round(($singlePageMargin / 12) * 100)}%"
>
    <div
        class={`flex ${$surahOrientation()} ${$isSidebar && !$zenMode ? "bg-white dark:bg-[#232634] " : ""} flex-row justify-center`}
        style:height="{height - $headerHeight - 2 * $csdMarginPx}px"
    >
        <!-- `activeCrossGroup?.` throughout, never `activeCrossGroup.`: when the
             split is dissolved the `{#if}` above turns false, but the
             expressions inside it are separate reactive reads and Svelte
             re-evaluates them before tearing the block down. Reading a property
             off the now-null group threw
             `null is not an object (partnerTabId)` mid-flush, which aborted the
             update — the unsplit button appeared to do nothing — and left the
             batch re-processing. The inner `{#if partnerTabId}` keeps the id a
             plain string for everything below. -->
        {#if activeCrossGroup}
            {@const partnerTabId = activeCrossGroup?.partnerTabId ?? null}
            {@const partnerTab = $tabs.find((t) => t.id === partnerTabId)}
            <div
                class="relative z-1 px-1 flex flex-col flex-1 min-w-0
                        {$zenMode
                    ? ''
                    : 'border-x border-stone-200 dark:border-[#414559] bg-white dark:bg-[#1c1c1c]'}"
            >
                {#if partnerTab?.type === "julia"}
                    <!-- Partner=Julia: left = JuliaEditor with embedded REPL -->
                    <JuliaEditor
                        tabId={partnerTabId}
                        hideRepl={false}
                    />
                {:else if partnerTab?.type === "lean"}
                    <!-- Partner=Lean: left = LeanEditor with embedded infoview -->
                    <LeanEditor
                        tabId={partnerTabId}
                        hideInfoview={false}
                    />
                {:else if partnerTab?.type === "typst"}
                    <!-- Partner=Typst: use TypstEditor's own resizable inline preview -->
                    <TypstEditor
                        tabId={partnerTabId}
                        inCrossHost={true}
                    />
                {:else if partnerTab?.type === "lexical"}
                    <!-- Partner=Lexical: left = LexicalEditor full-height -->
                    <RichTextEditor />
                {/if}
            </div>
        {:else if juliaReplMode}
            <!-- Julia REPL panel on the right (or left in RTL layout) — shared by all tabs.
                 When the active Julia group has a third file, it stacks above the REPL,
                 separated by a draggable horizontal divider (quad split layout). -->
            <div
                class="relative z-1 flex flex-col items-center
                        flex-1 min-w-0
                        {$zenMode
                    ? ''
                    : 'border-x border-stone-200 dark:border-[#414559] bg-white dark:bg-[#1c1c1c]'}"
            >
                {#if activeJuliaGroup?.tabC}
                    <div
                        class="w-full min-h-0 overflow-visible px-1"
                        style="flex: 0 0 {$juliaRightSplitRatio}%"
                    >
                        <JuliaEditor tabId={activeJuliaGroup.tabC} hideRepl={true} />
                    </div>
                    <StackSplitDivider
                        setRatio={(p) => juliaRightSplitRatio.set(p)}
                    />
                {/if}
                <!-- Same flush wrapper the Lean infoview gets; the pane's own
                     tab bar already names the active panel. -->
                <div
                    class="mb-5 w-full flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                    <JuliaReplPane />
                </div>
            </div>
        {:else if leanInfoviewMode}
            <!-- Lean infoview on the right (or left in RTL layout) — shared by
                 the active Lean group. When that group has a third file, it
                 stacks above the infoview, separated by a draggable horizontal
                 divider (quad split layout). -->
            <div
                class="relative z-1 flex flex-col items-center
                        flex-1 min-w-0
                        {$zenMode
                    ? ''
                    : 'border-x border-stone-200 dark:border-[#414559] bg-white dark:bg-[#1c1c1c]'}"
            >
                {#if activeLeanGroup?.tabC}
                    <div
                        class="w-full min-h-0 overflow-visible px-1"
                        style="flex: 0 0 {$leanRightSplitRatio}%"
                    >
                        <LeanEditor
                            tabId={activeLeanGroup.tabC}
                            hideInfoview={true}
                        />
                    </div>
                    <StackSplitDivider
                        setRatio={(p) => leanRightSplitRatio.set(p)}
                    />
                {/if}
                <div
                    class="mb-5 w-full flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                    <LeanInfoviewPane
                        runtime={leanEditorRuntime}
                        getCode={activeLeanCode}
                        onJump={jumpToLeanPosition}
                    />
                </div>
            </div>
        {:else if typstMode}
            <!-- Typst preview on the right. When the active Typst group has a third
                 file, it stacks above the preview (resizable). The preview always
                 reflects whichever Typst editor is the active tab. -->
            <div
                class="relative z-1 flex-1 min-w-0 h-full flex flex-col
                        {$zenMode
                    ? ''
                    : 'border-x border-stone-200 dark:border-[#414559] bg-white dark:bg-[#1c1c1c]'}"
            >
                {#if activeTypstGroup?.tabC}
                    <div
                        class="w-full min-h-0 overflow-visible px-1"
                        style="flex: 0 0 {$typstRightSplitRatio}%"
                    >
                        <TypstEditor tabId={activeTypstGroup.tabC} />
                    </div>
                    <StackSplitDivider
                        setRatio={(p) => typstRightSplitRatio.set(p)}
                    />
                    <!-- flex flex-col so TypstPreview's flex-1 root gets a bounded
                         height and its internal scroller works. -->
                    <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
                        <TypstPreview embedded={true} />
                    </div>
                {:else}
                    <TypstPreview embedded={true} />
                {/if}
            </div>
        {/if}
        <!-- Parchment stays mounted (hidden) in the alternate modes so the
             recitation audio and its floating mini player keep running. -->
        <div
            class="flex-1 min-w-0 h-full {activeCrossGroup ||
            juliaReplMode ||
            leanInfoviewMode ||
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
        {#if (juliaReplMode || leanInfoviewMode || typstMode) && $isSidebar}
            <SplitDivider />
        {/if}
        <Sidebar />
    </div>
</div>
<UpDownMargin />
<SurahWidget />
<EditorToolbar onOpenSettings={() => (showSettings = true)} />
<TourOverlay />
<AnimationChoiceDialog />
<QuickOpen />
<SettingsDialog
    open={showSettings}
    onClose={() => (showSettings = false)}
/>
<VerseOfDayDialog
    open={$verseOfDayDialogOpen}
    onClose={() => verseOfDayDialogOpen.set(false)}
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
<TypstDarkModeToast onOpenSettings={() => (showSettings = true)} />
<JuliaPlotViewer />
