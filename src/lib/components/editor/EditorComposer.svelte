<script lang="ts">
    import { CodeNode } from "$lexical/core/plugins/CodeHighlighter/CodeNode";
    import CodePlugin from "$lexical/core/plugins/CodeHighlighter/CodePlugin.svelte";
    import { EquationNode } from "$lexical/core/plugins/Equation/EquationNode";
    import EquationPlugin from "$lexical/core/plugins/Equation/EquationPlugin.svelte";
    import { QuranBlockNode } from "$lexical/core/plugins/Quran/QuranBlockNode";
    import QuranBlockPlugin from "$lexical/core/plugins/Quran/QuranBlockPlugin.svelte";
    import { JuliaCellNode } from "$lexical/core/plugins/JuliaCell/JuliaCellNode";
    import JuliaCellPlugin from "$lexical/core/plugins/JuliaCell/JuliaCellPlugin.svelte";
    import AiSelectionPlugin from "$lexical/core/plugins/AiSelectionPlugin.svelte";
    // import {
    // 	Composer,
    // 	ContentEditable,
    // 	ToolbarRichText,
    // 	ActionBar,
    // 	RichTextPlugin,
    // 	HistoryPlugin,
    // 	ListPlugin,
    // 	CheckListPlugin,
    // 	HorizontalRulePlugin,
    // 	ImagePlugin
    // } from 'svelte-lexical';
    import {
        Composer,
        ContentEditable,
        ToolbarRichText,
        RichTextPlugin,
        HistoryPlugin,
        ListPlugin,
        CheckListPlugin,
        HorizontalRulePlugin,
        ImagePlugin,
        TablePlugin,
        TableActionMenuPlugin,
        MarkdownShortcutPlugin,
        MarkdownPastePlugin,
        ALL_TRANSFORMERS,
    } from "../lexical";
    import { locale } from "$lib/i18n";
    import TableCellResizerPlugin from "$lexical/core/plugins/Table/TableCellResizerPlugin.svelte";
    import {
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        HorizontalRuleNode,
        ImageNode,
        TableNode,
        TableRowNode,
        TableCellNode,
        LinkNode,
        AutoLinkNode,
    } from "../lexical";
    import { editorTheme as PlaygroundEditorTheme } from "../lexical";
    import {
        $getRoot as getRoot,
        $createTextNode as createTextNode,
        $createParagraphNode as createParagraphNode,
    } from "../lexical";

    import CaptionEditorHistoryPlugin from "$lexical/core/plugins/Image/CaptionEditorHistoryPlugin.svelte";
    import SlashCommandPlugin from "$lexical/core/plugins/SlashCommand/SlashCommandPlugin.svelte";
    import EditorStorePlugin from "./EditorStorePlugin.svelte";
    import { createEmptyHistoryState } from "@lexical/history";
    import {
        lexicalHistoryState,
        lexicalEditorInstance,
    } from "$lib/stores/editor.store";
    import { activeTab } from "$lib/stores/tabs.store";
    import type { EditorTab } from "$lib/stores/tabs.store";
    import { onDestroy, tick } from "svelte";

    // Per-file editor-scroll memory shared across remounts of this component.
    // When the user switches to a Julia/Typst tab the EditorComposer is
    // unmounted; without this the scrollable ContentEditable returns to the
    // top on return. Lives on globalThis so the map survives Svelte's HMR.
    type ScrollMap = Map<string, number>;
    const SCROLL_BY_TAB: ScrollMap = (() => {
        const g = globalThis as unknown as {
            __editorComposerScrollByTab?: ScrollMap;
        };
        if (g.__editorComposerScrollByTab instanceof Map)
            return g.__editorComposerScrollByTab;
        const m: ScrollMap = new Map();
        g.__editorComposerScrollByTab = m;
        return m;
    })();
    let lastTabId: string | null = null;
    let lastScrollKey: string | null = null;
    // True while we're actively restoring scroll — the scroll listener
    // checks this so Lexical's caret-into-view scroll (caused by setEditorState)
    // doesn't immediately overwrite the saved offset with 0.
    let restoring = false;
    let editorShell = $state<HTMLDivElement | null>(null);

    function scrollKeyForTab(tab: EditorTab): string {
        return tab.path ?? tab.id;
    }

    function currentScrollTop(): number {
        return (
            window.scrollY ||
            document.scrollingElement?.scrollTop ||
            document.documentElement.scrollTop ||
            0
        );
    }

    function saveScroll(key: string | null = lastScrollKey): void {
        if (!key || restoring) return;
        SCROLL_BY_TAB.set(key, currentScrollTop());
    }

    // Restore the saved offset for a tab. The retry budget needs to outlast
    // both Lexical's setEditorState() (called by Sidebar.svelte:117 on tab
    // change — which can scroll the caret into view at the document top) and
    // any deferred layout work like image/equation rendering that grows the
    // document height. ~1 s is empirically enough on a slow machine.
    function restoreScroll(tabId: string, key: string): void {
        const target = SCROLL_BY_TAB.get(key);
        if (target === undefined) return;

        restoring = true;
        let attempts = 0;
        const MAX_ATTEMPTS = 60; // ~1 s @ 60fps
        const apply = () => {
            if (lastTabId !== tabId) {
                restoring = false;
                return;
            }
            window.scrollTo({ top: target, left: 0, behavior: "auto" });
            attempts += 1;
            if (attempts < MAX_ATTEMPTS) {
                requestAnimationFrame(apply);
            } else {
                // Give Lexical one more frame to settle, then release the lock
                // so genuine user scrolls start saving again.
                requestAnimationFrame(() => {
                    restoring = false;
                });
            }
        };

        void tick().then(() => requestAnimationFrame(apply));
    }

    // Save on tab change + arm restore. Restoration itself is gated on the
    // editor instance being available (see the next $effect), since Lexical
    // pushes a new EditorState after the tab swap that would otherwise scroll
    // the caret (at root start) into view and clobber our restore.
    $effect(() => {
        const tab = $activeTab;
        const next = tab?.id ?? null;
        const nextKey = tab ? scrollKeyForTab(tab) : null;
        if (lastTabId !== null && lastTabId !== next) {
            saveScroll(lastScrollKey);
        }
        lastTabId = next;
        lastScrollKey = nextKey;
    });

    // Trigger restore once the editor has applied the new tab's EditorState.
    // Sidebar.svelte's Effect C calls editor.setEditorState() after the tab
    // change — we hook the first updateListener fire after that to restore
    // scroll *after* Lexical has reflowed the new document.
    $effect(() => {
        const tab = $activeTab;
        const editor = $lexicalEditorInstance;
        if (!tab || !editor) return;
        const tabId = tab.id;
        const key = scrollKeyForTab(tab);

        let done = false;
        const unregister = editor.registerUpdateListener(() => {
            if (done) return;
            done = true;
            unregister();
            restoreScroll(tabId, key);
        });

        // If no update fires (e.g. tab content is identical to what's already
        // loaded), still restore after the next frame so a remount of the
        // component doesn't leave the scroll stuck at the top.
        const fallback = requestAnimationFrame(() => {
            if (done) return;
            done = true;
            unregister();
            restoreScroll(tabId, key);
        });

        return () => {
            unregister();
            cancelAnimationFrame(fallback);
        };
    });

    $effect(() => {
        const tab = $activeTab;
        const tabKey = tab ? scrollKeyForTab(tab) : null;
        if (!tabKey) return;

        const onScroll = () => saveScroll(tabKey);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    });

    onDestroy(() => {
        saveScroll();
    });

    const historyState = createEmptyHistoryState();
    lexicalHistoryState.set(historyState);

    const RTL_LOCALES = ["ar", "fa", "ur"];
    let editorDir = $derived(
        RTL_LOCALES.includes($locale) ? ("rtl" as const) : ("ltr" as const),
    );

    const initialConfig = {
        namespace: "Editor",
        theme: PlaygroundEditorTheme,
        nodes: [
            HeadingNode,
            ListNode,
            ListItemNode,
            QuoteNode,
            HorizontalRuleNode,
            ImageNode,
            EquationNode,
            QuranBlockNode,
            JuliaCellNode,
            CodeNode,
            TableNode,
            TableRowNode,
            TableCellNode,
            LinkNode,
            AutoLinkNode,
        ],
        onError: (error: Error) => {
            throw error;
        },
        editorState: () => {
            const root = getRoot();
            if (root.getFirstChild() === null) {
                const paragraph = createParagraphNode();
                root.append(paragraph);
            }
        },
    };
</script>

<Composer {initialConfig}>
    <div
        class="editor-shell p-2 relative overflow-visible"
        bind:this={editorShell}
    >
        <ToolbarRichText />
        <div class="editor-container flex flex-col justify-stretch">
            <div class="editor-scroller">
                <div class="editor">
                    <ContentEditable dir={editorDir} />
                </div>
            </div>
            <RichTextPlugin />
            <HistoryPlugin externalHistoryState={historyState} />
            <ListPlugin />
            <CheckListPlugin />
            <HorizontalRulePlugin />
            <ImagePlugin>
                <CaptionEditorHistoryPlugin />
            </ImagePlugin>
            <EquationPlugin />
            <AiSelectionPlugin />
            <CodePlugin />
            <TablePlugin />
            <TableCellResizerPlugin />
            {#if editorShell}
                <TableActionMenuPlugin
                    anchorElem={editorShell}
                    cellMerge={true}
                />
            {/if}
            <MarkdownShortcutPlugin transformers={ALL_TRANSFORMERS} />
            <MarkdownPastePlugin transformers={ALL_TRANSFORMERS} />
            <SlashCommandPlugin />
            <QuranBlockPlugin />
            <JuliaCellPlugin />
            <EditorStorePlugin />
        </div>
    </div>
</Composer>
