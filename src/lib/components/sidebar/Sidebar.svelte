<script lang="ts">
    import { onMount, tick } from "svelte";
    import { get } from "svelte/store";
    import CollapsibleSidebar from "$lib/components/shared/CollapsibleSidebar.svelte";
    import RichTextEditor from "$lib/components/editor/EditorComposer.svelte";
    import TypstEditor from "$lib/components/editor/TypstEditor.svelte";
    import JuliaEditor from "$lib/components/editor/JuliaEditor.svelte";
    import EditorTabs from "$lib/components/editor/EditorTabs.svelte";
    import ActionBar from "$lib/components/lexical/components/actionbar/ActionBar.svelte";
    import FileExplorer from "$lib/components/shared/FileExplorer.svelte";
    import GlobalSearch from "$lib/components/shared/GlobalSearch.svelte";
    import TableOfContents from "$lib/components/editor/TableOfContents.svelte";
    import {
        lexicalEditorInstance,
        lexicalHistoryState,
        typstSource,
        zenMode,
    } from "$lib/stores/editor.store";
    import {
        tabs,
        activeTab,
        activeTabId,
        createTab,
    } from "$lib/stores/tabs.store";
    import { hideSurahPage } from "$lib/stores/quran.svelte";
    import { juliaGroups, crossGroups } from "$lib/stores/julia-terminal.store";
    import type { CrossGroup } from "$lib/stores/julia-terminal.store";
    import Icon from "@iconify/svelte";
    import type { EditorTab } from "$lib/stores/tabs.store";
    import { CAN_UNDO_COMMAND, CAN_REDO_COMMAND } from "lexical";
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
            typstSource.set(tab.content);
        }
        // Lexical restore is handled by Effect C below (waits for editor instance)
    });

    // Effect C: restore lexical tab state once the editor instance is available.
    // Fires whenever $lexicalEditorInstance or $activeTab changes, so it works
    // both on first mount and after remount from a tab switch.
    const emptyLexicalState =
        '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';
    let lastRestoredForTabId: string | null = null;
    $effect(() => {
        const editor = $lexicalEditorInstance;
        const tab = $activeTab;

        if (!editor) {
            // Editor unmounted; reset so the next mount triggers restore
            lastRestoredForTabId = null;
            return;
        }
        if (!tab || tab.type !== "lexical") return;
        if (lastRestoredForTabId === tab.id) return; // already restored for this tab

        lastRestoredForTabId = tab.id;

        if (tab.content) {
            try {
                const parsed = JSON.parse(tab.content);
                const stateData = parsed.editorState ?? parsed;
                editor.setEditorState(
                    editor.parseEditorState(JSON.stringify(stateData)),
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

    // When host=Lexical and the partner tab is active, load and auto-save Lexical host content
    const emptyLexicalStateCross =
        '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

    $effect(() => {
        const cg = activeCrossGroup;
        const editor = $lexicalEditorInstance;
        if (!cg || !editor) return;
        const hostTab = get(tabs).find((t) => t.id === cg.hostTabId);
        if (!hostTab || hostTab.type !== "lexical") return;
        if ($activeTabId === cg.hostTabId) return; // host is active — Effect C handles it
        // Partner is active; load the Lexical host tab's content
        try {
            const parsed = JSON.parse(
                hostTab.content || emptyLexicalStateCross,
            );
            const stateData = parsed.editorState ?? parsed;
            editor.setEditorState(
                editor.parseEditorState(JSON.stringify(stateData)),
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
        const hostTabId = cg.hostTabId;
        const unregister = editor.registerUpdateListener(
            ({ dirtyElements, dirtyLeaves, tags }) => {
                if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
                if (tags.has('history-merge')) return;
                const json = JSON.stringify(editor.getEditorState().toJSON());
                tabs.update((ts) =>
                    ts.map((t) =>
                        t.id === hostTabId
                            ? { ...t, content: json, isDirty: true }
                            : t,
                    ),
                );
            },
        );
        return unregister;
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

    function fileTypeInfo(tab: EditorTab): {
        icon: string;
        label: string;
        color: string;
    } {
        const c = "text-brand-charcoal-300";
        if (tab.type === "julia")
            return {
                icon: "solar:code-bold-duotone",
                label: "Julia",
                color: c,
            };
        if (tab.type === "typst")
            return {
                icon: "solar:document-text-bold-duotone",
                label: "Typst",
                color: c,
            };
        if (tab.type === "lexical")
            return {
                icon: "solar:text-bold-duotone",
                label: "Rich Text",
                color: c,
            };
        const ext =
            (tab.path ?? tab.name).split(".").pop()?.toLowerCase() ?? "";
        const extMap: Record<string, { icon: string; label: string }> = {
            py: { icon: "solar:code-bold-duotone", label: ".py" },
            r: { icon: "solar:code-bold-duotone", label: ".r" },
            bib: { icon: "solar:book-bold-duotone", label: ".bib" },
            tex: { icon: "solar:document-text-bold-duotone", label: ".tex" },
            md: { icon: "solar:text-bold-duotone", label: ".md" },
            csv: { icon: "solar:database-bold-duotone", label: ".csv" },
            js: { icon: "solar:code-bold-duotone", label: ".js" },
            ts: { icon: "solar:code-bold-duotone", label: ".ts" },
            json: { icon: "solar:file-text-bold-duotone", label: ".json" },
            sh: { icon: "solar:terminal-bold-duotone", label: ".sh" },
            sql: { icon: "solar:database-bold-duotone", label: ".sql" },
            html: { icon: "solar:code-bold-duotone", label: ".html" },
            css: { icon: "solar:pallete-bold-duotone", label: ".css" },
            typ: { icon: "solar:document-text-bold-duotone", label: ".typ" },
        };
        const e = extMap[ext] ?? {
            icon: "solar:file-bold-duotone",
            label: ext ? `.${ext}` : "Text",
        };
        return { ...e, color: c };
    }
</script>

<CollapsibleSidebar roundRight={!juliaMode && !activeCrossGroup}>
    <div class="relative h-full flex flex-col overflow-visible">
        <!-- File Explorer button: outside editor on the left/right, same height as sidebar toggle -->
        <FileExplorer />
        <!-- Global Search button: just below File Explorer -->
        <GlobalSearch />
        <!-- Table of Contents panel -->
        <TableOfContents />
        <ActionBar />
        {#if $activeTab}
            {@const ft = fileTypeInfo($activeTab)}
            <div
                class="{$zenMode
                    ? 'opacity-0 hover:opacity-100 transition-opacity duration-200'
                    : ''} absolute -top-4.5 left-1/12 z-50 pointer-events-none"
            >
                <span
                    class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold
							 bg-brand-sand-100/80 border border-brand-sand-200 backdrop-blur-sm
							 dark:bg-[#292c3c]/80 dark:border-[#414559] {ft.color}"
                >
                    <Icon icon={ft.icon} width="0.6rem" />
                    {ft.label}
                </span>
            </div>
        {/if}
        <div class="flex-1 min-h-0 overflow-visible">
            {#if activeCrossGroup}
                <!-- Cross pair: sidebar always shows the HOST tab's editor -->
                {@const hostTabId = activeCrossGroup.hostTabId}
                {@const hostTab = $tabs.find((t) => t.id === hostTabId)}
                {#if hostTab?.type === "julia"}
                    <JuliaEditor
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
                <TypstEditor />
            {:else if $activeTab?.type === "julia"}
                {@const activeGroup = $juliaGroups.find(
                    (g) => g.tabA === $activeTabId || g.tabB === $activeTabId,
                )}
                {@const splitTabId = activeGroup
                    ? activeGroup.tabA === $activeTabId
                        ? activeGroup.tabB
                        : activeGroup.tabA
                    : null}
                {#if juliaMode}
                    {#if splitTabId}
                        <!-- Split view: two Julia editors stacked, REPL panels on the right -->
                        <div class="flex flex-col h-full">
                            <div class="flex-1 min-h-0 overflow-visible">
                                <JuliaEditor hideRepl={true} />
                            </div>
                            <div class="flex-1 min-h-0 overflow-visible">
                                <JuliaEditor
                                    tabId={splitTabId}
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
            {:else}
                <RichTextEditor />
            {/if}
        </div>
        <EditorTabs />
    </div>
</CollapsibleSidebar>
