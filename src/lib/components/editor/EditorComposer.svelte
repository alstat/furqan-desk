<script lang="ts">
    import { CodeNode } from "$lexical/core/plugins/CodeHighlighter/CodeNode";
    import CodePlugin from "$lexical/core/plugins/CodeHighlighter/CodePlugin.svelte";
    import { EquationNode } from "$lexical/core/plugins/Equation/EquationNode";
    import EquationPlugin from "$lexical/core/plugins/Equation/EquationPlugin.svelte";
    import { DrawingNode } from "$lexical/core/plugins/Drawing/DrawingNode";
    import DrawingPlugin from "$lexical/core/plugins/Drawing/DrawingPlugin.svelte";
    import { ReferenceListNode } from "$lexical/core/plugins/ReferenceList/ReferenceListNode";
    import { CitationNode } from "$lexical/core/plugins/Cite/CitationNode";
    import { QuranBlockNode } from "$lexical/core/plugins/Quran/QuranBlockNode";
    import QuranBlockPlugin from "$lexical/core/plugins/Quran/QuranBlockPlugin.svelte";
    import { JuliaCellNode } from "$lexical/core/plugins/JuliaCell/JuliaCellNode";
    import JuliaCellPlugin from "$lexical/core/plugins/JuliaCell/JuliaCellPlugin.svelte";
    import { LeanCellNode } from "$lexical/core/plugins/LeanCell/LeanCellNode";
    import LeanCellPlugin from "$lexical/core/plugins/LeanCell/LeanCellPlugin.svelte";
    import AiSelectionPlugin from "$lexical/core/plugins/AiSelectionPlugin.svelte";
    import TrailingParagraphPlugin from "$lexical/core/plugins/TrailingParagraphPlugin.svelte";
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

    import { ParagraphNode } from "lexical";
    import { ExtendedParagraphNode } from "$lexical/core/ExtendedParagraphNode";
    import CaptionEditorHistoryPlugin from "$lexical/core/plugins/Image/CaptionEditorHistoryPlugin.svelte";
    import LinkPlugin from "$lexical/core/plugins/link/LinkPlugin.svelte";
    import FloatingLinkEditorPlugin from "$lexical/core/plugins/link/FloatingLinkEditorPlugin.svelte";
    import SlashCommandPlugin from "$lexical/core/plugins/SlashCommand/SlashCommandPlugin.svelte";
    import CiteMenuPlugin from "$lexical/core/plugins/Cite/CiteMenuPlugin.svelte";
    import SpellcheckLexicalPlugin from "$lexical/core/plugins/Spellcheck/SpellcheckLexicalPlugin.svelte";
    import FindReplacePlugin from "$lexical/core/plugins/FindReplace/FindReplacePlugin.svelte";
    import SpellLanguageSelector from "./SpellLanguageSelector.svelte";
    import EditorStorePlugin from "./EditorStorePlugin.svelte";
    import { createEmptyHistoryState } from "@lexical/history";
    import {
        lexicalHistoryState,
        lexicalEditorInstance,
        zenMode,
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
    let lastMeasuredWidth = -1;
    // Whether the spelling dock's menu is open, so the dock can stop fading
    // itself while it is (see the dock's markup below).
    let spellMenuOpen = $state(false);
    // Measured width of the editor shell, fed to the toolbar so it can decide
    // whether the overflow menu items render inline or collapse to a dropdown.
    //
    // Observed by hand rather than with `bind:clientWidth`, because that writes
    // during the ResizeObserver's own callback: the toolbar re-renders from this
    // value, so the write dirties layout in the same pass the observer is
    // delivering — which the browser reports as "ResizeObserver loop completed
    // with undelivered notifications". Measuring on the next frame, and only
    // publishing a width that actually changed, keeps the two apart. The
    // toolbar's thresholds are tuned against `clientWidth`, so that is what is
    // read here.
    let editorWidth = $state(0);

    $effect(() => {
        const el = editorShell;
        if (!el || typeof ResizeObserver === "undefined") return;

        let frame: number | null = null;
        const measure = () => {
            frame = null;
            const next = el.clientWidth;
            if (next !== lastMeasuredWidth) {
                lastMeasuredWidth = next;
                editorWidth = next;
            }
        };
        const observer = new ResizeObserver(() => {
            if (frame === null) frame = requestAnimationFrame(measure);
        });
        observer.observe(el);
        measure();

        return () => {
            observer.disconnect();
            if (frame !== null) cancelAnimationFrame(frame);
        };
    });

    // The spelling dock's `bottom-0 right-4` used to be relative to
    // `.editor-shell` itself, which has no height cap of its own — nothing
    // stops its content (toolbar + document) from rendering taller than the
    // space its flex-1 parent (Sidebar.svelte) actually granted it. On Linux
    // that happens routinely: the CSD font stack (`html.linux-csd`, see
    // app.css) swaps in "Ubuntu", whose metrics run a little taller than the
    // system fonts Windows/macOS use, so editor-shell overflows its pane by a
    // few px — more as the UI scale grows the mismatch. `.app-shell`'s
    // `overflow-hidden` then clips whatever crosses its edge, dock included,
    // since the dock is pinned to editor-shell's own (now out-of-bounds)
    // bottom edge. Measuring against `.app-shell`'s own rect instead — and
    // switching to `fixed`, which already anchors to that rect via its
    // `translateZ(0)` containing-block trick on Linux CSD (see app.css) —
    // keeps the dock inside the visible frame regardless of why editor-shell
    // overflowed. Off Linux .app-shell has no transform, so `fixed` there
    // resolves against the real viewport, which is exactly what app-shell's
    // own rect equals there (no CSD margin) — same formula, no branching.
    let dockRight = $state(16);
    let dockBottom = $state(0);

    $effect(() => {
        const el = editorShell;
        if (!el || typeof ResizeObserver === "undefined") return;

        let frame: number | null = null;
        const measure = () => {
            frame = null;
            const shellRect = el.getBoundingClientRect();
            const clip = el
                .closest<HTMLElement>(".app-shell")
                ?.getBoundingClientRect();
            const cbRight = clip?.right ?? window.innerWidth;
            const cbBottom = clip?.bottom ?? window.innerHeight;
            const remPx =
                parseFloat(getComputedStyle(document.documentElement).fontSize) ||
                16;
            // Half a rem mirrors editor-shell's own `p-2`: CSS positions an
            // absolutely-positioned child against its containing block's
            // *padding* box, so the original `bottom-0` never actually sat
            // flush against editor-shell's outer edge either. Reapplying that
            // same gap against the clamp boundary keeps the clamped case
            // visually consistent with the normal one, instead of the dock
            // jumping to sit flush against .app-shell's rounded corner.
            const bottomInset = remPx * 0.5;
            const rightEdge = shellRect.right - remPx;
            const naturalBottomY = shellRect.bottom - bottomInset;
            const safeBottomY = cbBottom - bottomInset;
            const bottomY = Math.min(naturalBottomY, safeBottomY);
            dockRight = Math.max(remPx, cbRight - rightEdge);
            dockBottom = Math.max(bottomInset, cbBottom - bottomY);
        };
        const observer = new ResizeObserver(() => {
            if (frame === null) frame = requestAnimationFrame(measure);
        });
        observer.observe(el);
        const shell = el.closest<HTMLElement>(".app-shell");
        if (shell) observer.observe(shell);
        measure();

        return () => {
            observer.disconnect();
            if (frame !== null) cancelAnimationFrame(frame);
        };
    });

    let contentScroller: HTMLElement | null = null;
    let scrollCleanup: (() => void) | null = null;

    // Primitive projections of the active tab. The tabs store replaces tab
    // objects on edits (dirty flag, content sync), so effects must key off
    // these strings — depending on $activeTab directly would re-run the
    // scroll-restore on keystrokes and fight Lexical's caret-into-view scroll.
    let activeTabIdValue = $derived($activeTab?.id ?? null);
    let activeScrollKey = $derived(
        $activeTab ? scrollKeyForTab($activeTab) : null,
    );

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
        // Svelte 5 detaches the DOM before onDestroy/effect teardown runs, and
        // a detached element reads scrollTop 0 — saving then would clobber the
        // real offset the scroll listener captured while the editor was live.
        if (!el.isConnected) return;
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
        const next = activeTabIdValue;
        const nextKey = activeScrollKey;
        if (lastTabId !== null && lastTabId !== next) {
            saveScroll(lastScrollKey);
        }
        lastTabId = next;
        lastScrollKey = nextKey;
    });

    $effect(() => {
        const tabId = activeTabIdValue;
        const key = activeScrollKey;
        const editor = $lexicalEditorInstance;
        if (!tabId || !key || !editor) return;
        let done = false;
        let fallback1 = 0;
        let fallback2 = 0;
        let unregister: (() => void) | null = null;

        const stopListening = () => {
            unregister?.();
            unregister = null;
        };

        const trigger = () => {
            if (done) return;
            done = true;
            // The listener has served its purpose; leaving it registered would
            // schedule an animation frame on every keystroke for the rest of
            // the tab's life just to fall through the `done` check above.
            stopListening();
            restoreScroll(tabId, key);
        };

        unregister = editor.registerUpdateListener(() => {
            requestAnimationFrame(trigger);
        });

        // If Lexical doesn't emit an update for this mount, still restore once
        // the DOM has settled after remount.
        fallback1 = requestAnimationFrame(() => {
            fallback2 = requestAnimationFrame(trigger);
        });

        return () => {
            done = true;
            stopListening();
            cancelAnimationFrame(fallback1);
            cancelAnimationFrame(fallback2);
        };
    });

    $effect(() => {
        const shell = editorShell;
        const key = activeScrollKey;
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
            // Replace the core paragraph with our subclass so block-level styles
            // (e.g. line spacing) render and persist. ExtendedParagraphNode must
            // also be registered on its own (its type is 'extended-paragraph') so
            // Lexical can construct it; withKlass keeps $isParagraphNode /
            // instanceof checks working across plugins.
            ExtendedParagraphNode,
            {
                replace: ParagraphNode,
                with: () => new ExtendedParagraphNode(),
                withKlass: ExtendedParagraphNode,
            },
            HeadingNode,
            ListNode,
            ListItemNode,
            QuoteNode,
            HorizontalRuleNode,
            ImageNode,
            DrawingNode,
            EquationNode,
            ReferenceListNode,
            CitationNode,
            QuranBlockNode,
            JuliaCellNode,
            LeanCellNode,
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
        <ToolbarRichText {editorWidth} />
        <!-- `relative` anchors the find & replace panel, which floats over the
             top-right of the writing area, below the toolbar. -->
        <div class="editor-container relative flex flex-col justify-stretch">
            <div class="editor-scroller">
                <div class="editor">
                    <!-- Disable the webview's native spellchecker: we provide
                         our own (SpellcheckLexicalPlugin), so leaving the native
                         one on would double the squiggles and ignore the app's
                         spell-check toggle/language. -->
                    <ContentEditable dir={editorDir} spellCheck={false} />
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
            <DrawingPlugin />
            <EquationPlugin />
            <AiSelectionPlugin />
            <TrailingParagraphPlugin />
            <CodePlugin />
            <TablePlugin />
            <TableCellResizerPlugin />
            <LinkPlugin />
            {#if editorShell}
                <TableActionMenuPlugin
                    anchorElem={editorShell}
                    cellMerge={true}
                />
                <FloatingLinkEditorPlugin anchorElem={editorShell} />
            {/if}
            <MarkdownShortcutPlugin transformers={ALL_TRANSFORMERS} />
            <MarkdownPastePlugin transformers={ALL_TRANSFORMERS} />
            <SlashCommandPlugin />
            <CiteMenuPlugin />
            <QuranBlockPlugin />
            <JuliaCellPlugin />
            <LeanCellPlugin />
            <SpellcheckLexicalPlugin />
            <FindReplacePlugin />
            <EditorStorePlugin />
        </div>
        <!-- Spelling language picker, pinned to the bottom-right of the page.
             In zen / Sukun mode it stays hidden until hovered; otherwise it
             sits subtly and brightens on hover.
             The fade is dropped while its menu is open: the panel is a child of
             this dock, so at 35% it turns into a washed-out frame with the text
             faded out of sight — the menu looks emptied rather than open, and
             the pointer has usually left the dock by then (that is what opening
             a menu and reaching for it does). -->
        <div
            class="fixed z-20 transition-opacity duration-200 hover:opacity-100 {spellMenuOpen
                ? 'opacity-100'
                : $zenMode
                  ? 'opacity-0'
                  : 'opacity-35'}"
            style="right: {dockRight}px; bottom: {dockBottom}px;"
        >
            <SpellLanguageSelector up={true} bind:open={spellMenuOpen} />
        </div>
    </div>
</Composer>
