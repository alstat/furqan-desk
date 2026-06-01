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
    // checks this so any save during Lexical's caret-into-view phase doesn't
    // overwrite the saved offset with 0.
    let restoring = false;
    let editorShell = $state<HTMLDivElement | null>(null);
    let contentScroller: HTMLElement | null = null;
    let scrollCleanup: (() => void) | null = null;

    function scrollKeyForTab(tab: EditorTab): string {
        return tab.path ?? tab.id;
    }

    function getContentScroller(): HTMLElement | null {
        const el =
            editorShell?.querySelector<HTMLElement>(".ContentEditable__root") ??
            null;
        if (el) contentScroller = el;
        return el;
    }

    function currentScrollTop(): number {
        const el = contentScroller ?? getContentScroller();
        return el ? el.scrollTop : 0;
    }

    function applyScrollTop(value: number): void {
        const el = contentScroller ?? getContentScroller();
        if (el) {
            el.scrollTop = value;
        }
    }

    function saveScroll(key: string | null = lastScrollKey): void {
        if (!key || restoring) return;
        const el = contentScroller ?? getContentScroller();
        if (!el) return;
        SCROLL_BY_TAB.set(key, el.scrollTop);
    }

    function restoreScroll(tabId: string, key: string): void {
        const target = SCROLL_BY_TAB.get(key);
        if (target === undefined) return;

        restoring = true;
        let attempts = 0;
        let stableFrames = 0;
        const MAX_ATTEMPTS = 45;
        const apply = () => {
            if (lastTabId !== tabId) {
                restoring = false;
                return;
            }
            applyScrollTop(target);
            const drift = Math.abs(currentScrollTop() - target);
            stableFrames = drift <= 1 ? stableFrames + 1 : 0;
            attempts += 1;
            if (stableFrames < 3 && attempts < MAX_ATTEMPTS) {
                requestAnimationFrame(apply);
            } else {
                requestAnimationFrame(() => {
                    restoring = false;
                });
            }
        };

        void tick().then(() => requestAnimationFrame(apply));
    }

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

    $effect(() => {
        const tab = $activeTab;
        const editor = $lexicalEditorInstance;
        if (!tab || !editor) return;

        const tabId = tab.id;
        const key = scrollKeyForTab(tab);
        let done = false;
        let fallback1 = 0;
        let fallback2 = 0;

        const trigger = () => {
            if (done) return;
            done = true;
            restoreScroll(tabId, key);
        };

        const unregister = editor.registerUpdateListener(() => {
            requestAnimationFrame(trigger);
        });

        // If Lexical doesn't emit an update for this mount, still restore once
        // the DOM has settled after remount.
        fallback1 = requestAnimationFrame(() => {
            fallback2 = requestAnimationFrame(trigger);
        });

        return () => {
            done = true;
            unregister();
            cancelAnimationFrame(fallback1);
            cancelAnimationFrame(fallback2);
        };
    });

    $effect(() => {
        const tab = $activeTab;
        const shell = editorShell;
        const key = tab ? scrollKeyForTab(tab) : null;
        if (!shell || !key) return;

        let cancelled = false;
        scrollCleanup?.();
        scrollCleanup = null;

        void tick().then(() => {
            if (cancelled) return;
            const el = getContentScroller();
            if (!el) return;
            const onScroll = () => saveScroll(key);
            el.addEventListener("scroll", onScroll, { passive: true });
            scrollCleanup = () => el.removeEventListener("scroll", onScroll);
        });

        return () => {
            cancelled = true;
            scrollCleanup?.();
            scrollCleanup = null;
        };
    });

    onDestroy(() => {
        saveScroll();
        scrollCleanup?.();
        scrollCleanup = null;
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
