<script lang="ts">
    import { onMount, tick } from "svelte";
    import { get } from "svelte/store";
    import { syncLexicalEditorToTab } from "$lib/utils/lexicalTabSync";
    import CollapsibleSidebar from "$lib/components/shared/CollapsibleSidebar.svelte";
    import RichTextEditor from "$lib/components/editor/EditorComposer.svelte";
    import TypstEditor from "$lib/components/editor/TypstEditor.svelte";
    import JuliaEditor from "$lib/components/editor/JuliaEditor.svelte";
    import ScriptEditor from "$lib/components/editor/ScriptEditor.svelte";
    import { isScriptLanguage } from "$lib/languages/scriptLanguages";
    import LeanEditor from "$lib/components/editor/LeanEditor.svelte";
    import FileExplorer from "$lib/components/shared/FileExplorer.svelte";
    import GlobalSearch from "$lib/components/shared/GlobalSearch.svelte";
    import TableOfContents from "$lib/components/editor/TableOfContents.svelte";
    import StackSplitDivider from "$lib/components/shared/StackSplitDivider.svelte";
    import {
        lexicalEditorInstance,
        lexicalHistoryState,
        typstSource,
        typstPreviewPath,
        typstPreviewMode,
        typstPinnedPath,
        resolveTypstPreviewTab,
        zenMode,
        juliaSplitRatio,
        typstSplitRatio,
        leanSplitRatio,
    } from "$lib/stores/editor.store";
    import {
        tabs,
        activeTab,
        activeTabId,
        createTab,
    } from "$lib/stores/tabs.store";
    import { hideSurahPage } from "$lib/stores/quran.svelte";
    import {
        juliaGroups,
        typstGroups,
        leanGroups,
        crossGroups,
    } from "$lib/stores/julia-terminal.store";
    import type { CrossGroup } from "$lib/stores/julia-terminal.store";
    import type { EditorTab } from "$lib/stores/tabs.store";
    import { CAN_UNDO_COMMAND, CAN_REDO_COMMAND } from "lexical";
    import type { LexicalEditor } from "lexical";
    import type { HistoryState } from "@lexical/history";

    // Bootstrap: ensure at least one tab exists
    onMount(() => {
        if (get(tabs).length === 0) {
            const t = createTab("lexical");
            tabs.set([t]);
            activeTabId.set(t.id);
        }
    });

    // Per-tab Lexical history snapshots (saved when leaving a lexical tab)
    type HistorySnapshot = Pick<HistoryState, "undoStack" | "redoStack">;
    const lexicalTabHistories = new Map<string, HistorySnapshot>();

    // Cross-type switches can also change the overall page viewport, not just
    // the editor-local scroller. Keep a lightweight per-tab window scroll
    // snapshot so returning to a tab restores the same screen position.
    type WindowScrollMap = Map<string, number>;
    const WINDOW_SCROLL_BY_TAB: WindowScrollMap = (() => {
        const g = globalThis as unknown as {
            __sidebarWindowScrollByTab?: WindowScrollMap;
        };
        if (g.__sidebarWindowScrollByTab instanceof Map) {
            return g.__sidebarWindowScrollByTab;
        }
        const m: WindowScrollMap = new Map();
        g.__sidebarWindowScrollByTab = m;
        return m;
    })();
    let lastWindowTabId: string | null = null;
    let lastWindowScrollKey: string | null = null;
    let restoringWindowScroll = false;

    function scrollKeyForTab(tab: EditorTab): string {
        return tab.path ?? tab.id;
    }

    function currentWindowScrollTop(): number {
        return (
            window.scrollY ||
            document.scrollingElement?.scrollTop ||
            document.documentElement.scrollTop ||
            0
        );
    }

    function saveWindowScroll(key: string | null = lastWindowScrollKey): void {
        if (!key || restoringWindowScroll) return;
        WINDOW_SCROLL_BY_TAB.set(key, currentWindowScrollTop());
    }

    function restoreWindowScroll(tabId: string, key: string): void {
        const target = WINDOW_SCROLL_BY_TAB.get(key);
        if (target === undefined) return;

        restoringWindowScroll = true;
        let attempts = 0;
        let stableFrames = 0;
        const MAX_ATTEMPTS = 20;
        const apply = () => {
            if (lastWindowTabId !== tabId) {
                restoringWindowScroll = false;
                return;
            }
            window.scrollTo({ top: target, left: 0, behavior: "auto" });
            const drift = Math.abs(currentWindowScrollTop() - target);
            stableFrames = drift <= 1 ? stableFrames + 1 : 0;
            attempts += 1;
            if (stableFrames < 2 && attempts < MAX_ATTEMPTS) {
                requestAnimationFrame(apply);
            } else {
                requestAnimationFrame(() => {
                    restoringWindowScroll = false;
                });
            }
        };

        void tick().then(() => requestAnimationFrame(apply));
    }

    // When active tab changes: sync editor state
    // Effect A: runs BEFORE DOM mutations so the lexical editor is still alive when saving
    let prevTabIdPre: string | null = null;
    $effect.pre(() => {
        const tab = $activeTab;
        if (!tab || tab.id === prevTabIdPre) return;

        if (lastWindowTabId !== null && lastWindowTabId !== tab.id) {
            saveWindowScroll(lastWindowScrollKey);
        }

        // Save departing lexical tab state + history before the editor unmounts
        if (prevTabIdPre) {
            const prevTab = get(tabs).find((t) => t.id === prevTabIdPre);
            if (prevTab?.type === "lexical") {
                const editor = get(lexicalEditorInstance);
                if (editor) {
                    const json = JSON.stringify(
                        editor.getEditorState().toJSON(),
                    );
                    tabs.update((ts) =>
                        ts.map((t) =>
                            t.id === prevTabIdPre ? { ...t, content: json } : t,
                        ),
                    );
                }
                const hs = get(lexicalHistoryState);
                if (hs) {
                    lexicalTabHistories.set(prevTabIdPre, {
                        undoStack: [...hs.undoStack],
                        redoStack: [...hs.redoStack],
                    });
                }
            }
        }
        prevTabIdPre = tab.id;
    });

    $effect(() => {
        const tab = $activeTab;
        const next = tab?.id ?? null;
        const nextKey = tab ? scrollKeyForTab(tab) : null;
        lastWindowTabId = next;
        lastWindowScrollKey = nextKey;
        if (next !== null && nextKey !== null) {
            restoreWindowScroll(next, nextKey);
        }
    });

    // Effect B: restore non-lexical tab state after DOM updates
    let prevTabId: string | null = null;
    $effect(() => {
        const tab = $activeTab;
        if (!tab || tab.id === prevTabId) return;
        prevTabId = tab.id;

        if (tab.type === "typst" || tab.type === "text") {
            // Feed the preview the resolved source: the pinned file (pinned mode)
            // or the freshly-activated tab. Mirrors TypstEditor so switching tabs
            // doesn't momentarily clobber a pinned preview with the active file.
            const previewTab = resolveTypstPreviewTab(
                $tabs,
                tab,
                $typstPreviewMode,
                $typstPinnedPath,
            );
            if (previewTab) {
                typstSource.set(previewTab.content);
                typstPreviewPath.set(previewTab.path ?? null);
            }
        }
        // Lexical restore is handled by Effect C below (waits for editor instance)
    });

    // Effect C: restore lexical tab state once the editor instance is available.
    // Fires whenever $lexicalEditorInstance or $activeTab changes, so it works
    // both on first mount and after remount from a tab switch.
    const emptyLexicalState =
        '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';
    let lastRestoredForTabId: string | null = null;
    let lastRestoredEditor: LexicalEditor | null = null;
    $effect(() => {
        const editor = $lexicalEditorInstance;
        const tab = $activeTab;

        if (!editor) {
            // Editor unmounted; reset so the next mount triggers restore
            lastRestoredForTabId = null;
            lastRestoredEditor = null;
            return;
        }
        if (!tab || tab.type !== "lexical") return;
        // Already restored for this tab AND this editor instance. The editor
        // is keyed too because a cross-group create/remove remounts the
        // RichTextEditor without a tab switch — the new (empty) instance must
        // be restored even though the tab id is unchanged.
        if (lastRestoredForTabId === tab.id && lastRestoredEditor === editor)
            return;

        lastRestoredForTabId = tab.id;
        lastRestoredEditor = editor;

        if (tab.content) {
            try {
                const parsed = JSON.parse(tab.content);
                const stateData = parsed.editorState ?? parsed;
                editor.setEditorState(
                    editor.parseEditorState(stateData),
                    { tag: 'history-merge' },
                );
            } catch {
                /* ignore parse errors — leave editor as-is */
            }
        } else {
            editor.setEditorState(
                editor.parseEditorState(emptyLexicalState),
                { tag: 'history-merge' },
            );
        }

        const hs = get(lexicalHistoryState);
        if (hs) {
            const saved = lexicalTabHistories.get(tab.id);
            hs.undoStack = saved ? [...saved.undoStack] : [];
            hs.redoStack = saved ? [...saved.redoStack] : [];
            editor.dispatchCommand(CAN_UNDO_COMMAND, hs.undoStack.length > 0);
            editor.dispatchCommand(CAN_REDO_COMMAND, hs.redoStack.length > 0);
        }
    });

    // Whether we're in "Julia side-panel" mode: REPL moves to the right side
    // Excluded when in a cross-type pair (where REPL is embedded in sidebar)
    let activeCrossGroup = $derived(
        $hideSurahPage()
            ? ($crossGroups.find(
                  (g: CrossGroup) =>
                      g.hostTabId === $activeTabId ||
                      g.partnerTabId === $activeTabId,
              ) ?? null)
            : null,
    );
    let juliaMode = $derived(
        $hideSurahPage() && $activeTab?.type === "julia" && !activeCrossGroup,
    );
    // Same idea for Lean: with the Parchment hidden, the infoview moves out of
    // the editor and into the right column, shared by the group's members.
    let leanMode = $derived(
        $hideSurahPage() && $activeTab?.type === "lean" && !activeCrossGroup,
    );

    // Entering/leaving a cross group swaps the editor markup branch, which
    // destroys and remounts the RichTextEditor WITHOUT a tab switch — so
    // Effect A never fires and any unsaved Lexical state would be lost with
    // the old editor instance. Flush it into its tab before the DOM swap,
    // while the old editor is still alive ($effect.pre).
    let prevCrossKey: string | null | undefined = undefined;
    let prevCrossLexicalTabId: string | null = null;
    $effect.pre(() => {
        const cg = activeCrossGroup;
        const key = cg?.id ?? null;
        if (prevCrossKey !== undefined && key !== prevCrossKey) {
            const editor = get(lexicalEditorInstance);
            // Tab the live editor was displaying before this change: the old
            // group's lexical member, or the active lexical tab if ungrouped.
            const displayedId =
                prevCrossKey !== null
                    ? prevCrossLexicalTabId
                    : (get(tabs).find((t) => t.id === get(activeTabId))
                            ?.type === "lexical"
                        ? get(activeTabId)
                        : null);
            if (editor && displayedId) {
                const json = JSON.stringify(editor.getEditorState().toJSON());
                tabs.update((ts) =>
                    ts.map((t) =>
                        t.id === displayedId ? { ...t, content: json } : t,
                    ),
                );
                const hs = get(lexicalHistoryState);
                if (hs) {
                    lexicalTabHistories.set(displayedId, {
                        undoStack: [...hs.undoStack],
                        redoStack: [...hs.redoStack],
                    });
                }
            }
        }
        prevCrossKey = key;
        prevCrossLexicalTabId = cg
            ? (get(tabs).find(
                  (t) =>
                      (t.id === cg.hostTabId || t.id === cg.partnerTabId) &&
                      t.type === "lexical",
              )?.id ?? null)
            : null;
    });

    // When host=Lexical and the partner tab is active, load and auto-save Lexical host content
    const emptyLexicalStateCross =
        '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

    // Seeded once per (tab, editor) pair — the same guard the restore effect
    // above uses, and for the same reason. Without it, every flip of "which side
    // of the split is active" replaced the whole editor state, and each replace
    // remounts every decorator in the document (tables, Qur'an blocks,
    // equations, drawings). Focusing a pane sets the active tab, which flips
    // this, which remounts, which moves focus — the loop behind the hang.
    let lastSeededHostTabId: string | null = null;
    let lastSeededHostEditor: unknown = null;
    $effect(() => {
        const cg = activeCrossGroup;
        const editor = $lexicalEditorInstance;
        if (!cg || !editor) {
            lastSeededHostTabId = null;
            lastSeededHostEditor = null;
            return;
        }
        const hostTab = get(tabs).find((t) => t.id === cg.hostTabId);
        if (!hostTab || hostTab.type !== "lexical") return;
        if ($activeTabId === cg.hostTabId) return; // host is active — Effect C handles it
        if (
            lastSeededHostTabId === hostTab.id &&
            lastSeededHostEditor === editor
        ) {
            return;
        }
        lastSeededHostTabId = hostTab.id;
        lastSeededHostEditor = editor;
        // Partner is active; load the Lexical host tab's content
        try {
            const parsed = JSON.parse(
                hostTab.content || emptyLexicalStateCross,
            );
            const stateData = parsed.editorState ?? parsed;
            editor.setEditorState(
                editor.parseEditorState(stateData),
                { tag: 'history-merge' },
            );
        } catch {
            /* ignore */
        }
    });

    $effect(() => {
        const cg = activeCrossGroup;
        const editor = $lexicalEditorInstance;
        if (!cg || !editor) return;
        const hostTab = get(tabs).find((t) => t.id === cg.hostTabId);
        if (!hostTab || hostTab.type !== "lexical") return;
        if ($activeTabId === cg.hostTabId) return; // host is active — normal save applies
        return syncLexicalEditorToTab(editor, cg.hostTabId);
    });

    // Split tab id (for badge visibility)
    let _activeGroup = $derived(
        $juliaGroups.find(
            (g) => g.tabA === $activeTabId || g.tabB === $activeTabId,
        ),
    );
    let splitTabId = $derived(
        _activeGroup
            ? _activeGroup.tabA === $activeTabId
                ? _activeGroup.tabB
                : _activeGroup.tabA
            : null,
    );

</script>

<CollapsibleSidebar>
    <div class="relative h-full flex flex-col overflow-visible">
        <!-- File Explorer button: outside editor on the left/right, same height as sidebar toggle -->
        <FileExplorer />
        <!-- Global Search button: just below File Explorer -->
        <GlobalSearch />
        <!-- Table of Contents panel -->
        <TableOfContents />
        <div class="flex-1 min-h-0 overflow-visible">
            {#if activeCrossGroup}
                <!-- Cross pair: sidebar always shows the HOST tab's editor -->
                <!-- Optional chaining for the same reason as +page.svelte: the
                     `{#if}` above flips to false when a split is dissolved, but
                     these reads re-run before the block is torn down. -->
                {@const hostTabId = activeCrossGroup?.hostTabId ?? null}
                {@const hostTab = $tabs.find((t) => t.id === hostTabId)}
                {#if hostTab?.type === "julia"}
                    <JuliaEditor
                        tabId={$activeTabId !== hostTabId ? hostTabId : null}
                        hideRepl={false}
                    />
                {:else if hostTab?.type === "lean"}
                    <!-- Infoview stays embedded below the editor, as with the
                         Julia REPL: the left panel belongs to the partner. -->
                    <LeanEditor
                        tabId={$activeTabId !== hostTabId ? hostTabId : null}
                        hideInfoview={false}
                    />
                {:else if isScriptLanguage(hostTab?.type)}
                    <!-- host=R/Python: REPL stays embedded below the editor,
                         as with Julia — the left panel belongs to the partner. -->
                    <ScriptEditor
                        tabId={$activeTabId !== hostTabId ? hostTabId : null}
                        hideRepl={false}
                    />
                {:else if hostTab?.type === "typst" || hostTab?.type === "text"}
                    <!-- inCrossHost=true: shows inline preview instead of side-by-side preview -->
                    <TypstEditor
                        tabId={$activeTabId !== hostTabId ? hostTabId : null}
                        inCrossHost={true}
                    />
                {:else}
                    <!-- host=lexical: RichTextEditor (load/save handled by effects above) -->
                    <RichTextEditor />
                {/if}
            {:else if $activeTab?.type === "typst" || $activeTab?.type === "text"}
                {@const activeTypstGroup = $typstGroups.find(
                    (g) =>
                        g.tabA === $activeTabId ||
                        g.tabB === $activeTabId ||
                        g.tabC === $activeTabId,
                )}
                {#if activeTypstGroup}
                    <!-- Split view: the two primary Typst editors stack in this
                         (left) column; the shared preview — and an optional third
                         editor — live in the right column. tabA/tabB are explicit so
                         the layout is stable regardless of which member is active. -->
                    <div class="flex flex-col h-full">
                        <div
                            class="min-h-0 overflow-visible"
                            style="flex: 0 0 {$typstSplitRatio}%"
                        >
                            <TypstEditor tabId={activeTypstGroup.tabA} />
                        </div>
                        <div class="-mx-1">
                            <StackSplitDivider
                                setRatio={(p) => typstSplitRatio.set(p)}
                            />
                        </div>
                        <div class="flex-1 min-h-0 overflow-visible">
                            <TypstEditor tabId={activeTypstGroup.tabB} />
                        </div>
                    </div>
                {:else}
                    <TypstEditor />
                {/if}
            {:else if $activeTab?.type === "julia"}
                {@const activeGroup = $juliaGroups.find(
                    (g) =>
                        g.tabA === $activeTabId ||
                        g.tabB === $activeTabId ||
                        g.tabC === $activeTabId,
                )}
                {#if juliaMode}
                    {#if activeGroup}
                        <!-- Split view: the two primary Julia editors stack in this
                             (left) column, REPL — and an optional third editor — on the
                             right. The horizontal divider resizes the top/bottom heights.
                             tabA/tabB are rendered explicitly so the layout is stable no
                             matter which group member is the active tab. -->
                        <div class="flex flex-col h-full">
                            <div
                                class="min-h-0 overflow-visible"
                                style="flex: 0 0 {$juliaSplitRatio}%"
                            >
                                <JuliaEditor
                                    tabId={activeGroup.tabA}
                                    hideRepl={true}
                                />
                            </div>
                            <StackSplitDivider
                                class="-mx-1"
                                setRatio={(p) => juliaSplitRatio.set(p)}
                            />
                            <div class="flex-1 min-h-0 overflow-visible">
                                <JuliaEditor
                                    tabId={activeGroup.tabB}
                                    hideRepl={true}
                                />
                            </div>
                        </div>
                    {:else}
                        <!-- Single full-height Julia editor, REPL on right -->
                        <JuliaEditor hideRepl={true} />
                    {/if}
                {:else}
                    <!-- Normal mode: editor + embedded REPL panel at the bottom -->
                    <JuliaEditor />
                {/if}
            {:else if isScriptLanguage($activeTab?.type)}
                <!-- R / Python: the editor alone. Its REPL is the right-hand
                     column (see `scriptReplMode` in +page.svelte), the way
                     Julia's is — so this must not mount a second one. -->
                <ScriptEditor hideRepl={true} />
            {:else if $activeTab?.type === "lean"}
                {@const activeLeanGroup = $leanGroups.find(
                    (g) =>
                        g.tabA === $activeTabId ||
                        g.tabB === $activeTabId ||
                        g.tabC === $activeTabId,
                )}
                {#if leanMode}
                    {#if activeLeanGroup}
                        <!-- Split view: the two primary Lean editors stack in this
                             (left) column, the shared infoview — and an optional
                             third editor — on the right. tabA/tabB are rendered
                             explicitly so the layout is stable no matter which
                             group member is the active tab. -->
                        <div class="flex flex-col h-full">
                            <div
                                class="min-h-0 overflow-visible"
                                style="flex: 0 0 {$leanSplitRatio}%"
                            >
                                <LeanEditor
                                    tabId={activeLeanGroup.tabA}
                                    hideInfoview={true}
                                />
                            </div>
                            <StackSplitDivider
                                class="-mx-1"
                                setRatio={(p) => leanSplitRatio.set(p)}
                            />
                            <div class="flex-1 min-h-0 overflow-visible">
                                <LeanEditor
                                    tabId={activeLeanGroup.tabB}
                                    hideInfoview={true}
                                />
                            </div>
                        </div>
                    {:else}
                        <!-- Single full-height Lean editor, infoview on the right -->
                        <LeanEditor hideInfoview={true} />
                    {/if}
                {:else}
                    <!-- Normal mode: editor + embedded infoview at the bottom -->
                    <LeanEditor />
                {/if}
            {:else}
                <RichTextEditor />
            {/if}
        </div>
    </div>
</CollapsibleSidebar>
