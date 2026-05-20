<script lang="ts">
    import { onMount, tick } from "svelte";
    import Icon from "@iconify/svelte";
    // Registers the cell's icons offline so they render without the Iconify API.
    import "$lib/icons/julia-cell-icons";
    import { EditorView, keymap, lineNumbers } from "@codemirror/view";
    import { EditorState, Compartment } from "@codemirror/state";
    import {
        defaultKeymap,
        history,
        historyKeymap,
        indentWithTab,
    } from "@codemirror/commands";
    import { syntaxHighlighting } from "@codemirror/language";
    import { getEditor } from "$lexical/core/composerContext.js";
    import {
        $getNodeByKey as getNodeByKey,
        $getRoot as getRoot,
        $isElementNode as isElementNode,
        type LexicalNode,
    } from "lexical";
    import {
        $isJuliaCellNode as isJuliaCellNode,
        type JuliaCellDisplayMode,
    } from "./JuliaCellNode";
    import {
        runJuliaCell,
        interruptJuliaCell,
        restartJuliaKernel,
        juliaCellFontSize,
        juliaCellLineHeight,
        juliaCellRunners,
        juliaCellClearers,
        type JuliaCellPlot,
    } from "$lib/stores/julia-notebook";
    import {
        juliaSupport,
        juliaLightHighlight,
        juliaDarkHighlight,
    } from "$lib/codemirror/julia";
    import { latexInput } from "$lib/codemirror/latexInput";
    import { wrapSelection } from "$lib/codemirror/wrapSelection";
    import { createNodeSelectionStore } from "../../nodeSelectionStore.js";
    import { appDarkMode } from "$lib/stores/editor.store";
    import { isPro } from "$lib/stores/auth.store";
    import AiSelectionToolbar from "$lib/components/shared/AiSelectionToolbar.svelte";
    import { t } from "$lib/i18n";

    interface Props {
        code?: string;
        output?: string;
        hasError?: boolean;
        plots?: JuliaCellPlot[];
        displayMode?: JuliaCellDisplayMode;
        nodeKey?: string;
        autoEdit?: boolean;
    }

    let {
        code = "",
        output = "",
        hasError = false,
        plots = [],
        displayMode = "both",
        nodeKey = "",
        autoEdit = false,
    }: Props = $props();

    const editor = getEditor();
    const isSelected = createNodeSelectionStore(editor, nodeKey);

    // Editable source and the result currently shown beneath it. Seeded from
    // the node's persisted state so reloading a document keeps prior output.
    let editCode = code;
    let liveOutput = $state(output);
    let liveError = $state(hasError);
    let livePlots = $state<JuliaCellPlot[]>(plots);
    let running = $state(false);
    let runCount = $state(0);
    let mode = $state<JuliaCellDisplayMode>(displayMode);
    let codeWrap = $state(true);
    // Font size / line height controls stay collapsed by default — they're
    // typically set once when the cell is created and rarely touched after.
    let showSizeOptions = $state(false);

    let hasRun = $derived(runCount > 0 || output !== "" || plots.length > 0);
    let showCode = $derived(mode !== "output");
    let showOutput = $derived(mode !== "code");
    // True when a plot is the visible output — used to drop the cell border
    // and chrome so the plot is shown unobstructed.
    let plotUnboxed = $derived(showOutput && hasRun && livePlots.length > 0);

    // Caret colour follows the app theme — matches the code text in each mode.
    let caretColor = $derived($appDarkMode ? "#c6d0f5" : "#2f2f2f");

    let editorHost: HTMLDivElement | null = $state(null);
    let view: EditorView | null = null;
    const highlightComp = new Compartment();
    const wrapComp = new Compartment();

    // ── AI selection toolbar (pro users) ─────────────────────────────────────
    let aiSelection = $state<{
        from: number;
        to: number;
        text: string;
        x: number;
        y: number;
    } | null>(null);

    // Compute the floating toolbar's anchor from the current CodeMirror
    // selection, mirroring CodeMirrorEditor. Clears when there's no usable
    // selection, the user isn't pro, or the editor lost focus.
    function updateAiSelection() {
        if (!view || !$isPro) {
            aiSelection = null;
            return;
        }
        const selection = view.state.selection.main;
        if (selection.empty) {
            aiSelection = null;
            return;
        }
        const from = Math.min(selection.from, selection.to);
        const to = Math.max(selection.from, selection.to);
        const text = view.state.sliceDoc(from, to);
        if (!text.trim()) {
            aiSelection = null;
            return;
        }
        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);
        if (!start && !end) {
            aiSelection = null;
            return;
        }
        const left = start?.left ?? end!.left;
        const right = end?.right ?? start!.right;
        const top = Math.min(start?.top ?? end!.top, end?.top ?? start!.top);
        const viewportWidth = window.innerWidth || 0;
        aiSelection = {
            from,
            to,
            text,
            x: Math.max(180, Math.min(viewportWidth - 180, (left + right) / 2)),
            y: Math.max(12, top - 8),
        };
    }

    function replaceAiSelection(replacement: string) {
        if (!view || !aiSelection) return;
        const from = Math.min(aiSelection.from, view.state.doc.length);
        const to = Math.min(aiSelection.to, view.state.doc.length);
        view.dispatch({
            changes: { from, to, insert: replacement },
            selection: { anchor: from + replacement.length },
            scrollIntoView: true,
        });
        view.focus();
        aiSelection = null;
    }

    function toggleWrap() {
        codeWrap = !codeWrap;
        view?.dispatch({
            effects: wrapComp.reconfigure(
                codeWrap ? EditorView.lineWrapping : [],
            ),
        });
        tick().then(() => view?.requestMeasure());
    }

    const MODES: { id: JuliaCellDisplayMode; icon: string }[] = [
        { id: "both", icon: "tabler:layout-rows" },
        { id: "code", icon: "tabler:code" },
        { id: "output", icon: "tabler:terminal-2" },
    ];

    // Decode a base64 payload that holds UTF-8 text (e.g. a Plotly HTML
    // document) — plain atob() would mangle any non-ASCII bytes.
    function decodeB64Utf8(b64: string): string {
        const bin = atob(b64);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }

    // Build the srcdoc for a Plotly plot — decode the HTML and inject a style
    // reset so a fixed-width figure can't produce a horizontal scrollbar.
    function plotlyIframeDoc(b64: string): string {
        return (
            "<style>html,body{margin:0;overflow-x:hidden;}</style>" +
            decodeB64Utf8(b64)
        );
    }

    function highlightExt(dark: boolean) {
        return syntaxHighlighting(
            dark ? juliaDarkHighlight : juliaLightHighlight,
        );
    }

    function persistCode() {
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (node && isJuliaCellNode(node)) {
                node.setCode(editCode);
            }
        });
    }

    function setMode(next: JuliaCellDisplayMode) {
        mode = next;
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (node && isJuliaCellNode(node)) {
                node.setDisplayMode(next);
            }
        });
        // CodeMirror needs to re-measure after being un-hidden.
        if (next !== "output") {
            tick().then(() => view?.requestMeasure());
        }
    }

    // Font size / line height are shared across all cells via global stores,
    // so adjusting one cell re-styles every cell.
    function adjustCodeFontSize(delta: number) {
        juliaCellFontSize.update((v) => Math.min(18, Math.max(9, v + delta)));
    }

    function adjustCodeLineHeight(delta: number) {
        juliaCellLineHeight.update((v) => {
            const next = Math.round((v + delta) * 10) / 10;
            return Math.min(2.5, Math.max(1, next));
        });
    }

    // Re-measure CodeMirror whenever the shared display prefs change — fires in
    // every mounted cell, not just the one whose header was clicked.
    $effect(() => {
        void $juliaCellFontSize;
        void $juliaCellLineHeight;
        tick().then(() => view?.requestMeasure());
    });

    async function run() {
        if (running || !editCode.trim()) return;
        running = true;
        liveOutput = "";
        liveError = false;
        livePlots = [];
        persistCode();

        const result = await runJuliaCell(editCode, (partial) => {
            liveOutput = partial.text;
            liveError = partial.hasError;
            livePlots = partial.plots;
        });

        liveOutput = result.text;
        liveError = result.hasError;
        livePlots = result.plots;
        running = false;
        runCount += 1;

        // Persist the final result onto the node so it survives serialization.
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (node && isJuliaCellNode(node)) {
                node.setResult(result.text, result.hasError, result.plots);
            }
        });
    }

    // Stop the running cell. Prefer a SIGINT-based interrupt (keeps the kernel
    // and its state alive); fall back to a full kernel restart on platforms
    // where interrupting isn't supported.
    async function stop() {
        if (!running) return;
        try {
            await interruptJuliaCell();
        } catch {
            await restartJuliaKernel();
            running = false;
        }
    }

    // Wipe this cell's output and run count, and clear the persisted result on
    // the node so a kernel restart leaves no stale output behind.
    function clearOutput() {
        liveOutput = "";
        liveError = false;
        livePlots = [];
        runCount = 0;
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (node && isJuliaCellNode(node)) {
                node.setResult("", false, []);
            }
        });
    }

    let restarting = $state(false);
    // Restart the shared Julia kernel — clears all variables and loaded
    // packages, and wipes every cell's output so the reset is visible.
    async function restartKernel() {
        if (restarting) return;
        restarting = true;
        try {
            await restartJuliaKernel();
            juliaCellClearers.forEach((clear) => clear());
        } finally {
            restarting = false;
            running = false;
        }
    }

    // Run-button split menu — lets the user pick "Run cell" vs "Run all".
    // The menu is positioned `fixed` (anchored to the caret at open time) so
    // it isn't clipped by the cell's `overflow-hidden` container, which would
    // otherwise hide it on short/empty cells.
    let showRunMenu = $state(false);
    let runMenuPos = $state<{ x: number; y: number }>({ x: 0, y: 0 });

    function toggleRunMenu(event: MouseEvent) {
        if (showRunMenu) {
            showRunMenu = false;
            return;
        }
        const rect = (
            event.currentTarget as HTMLElement
        ).getBoundingClientRect();
        runMenuPos = { x: rect.right, y: rect.bottom + 3 };
        showRunMenu = true;
    }

    // Run every Julia cell in the document, in document order, starting from
    // the first. Each cell's own run() drives its UI and persists its result;
    // the shared kernel queue keeps execution strictly sequential.
    async function runAll() {
        showRunMenu = false;
        const keys: string[] = [];
        editor.getEditorState().read(() => {
            const collect = (node: LexicalNode) => {
                if (isJuliaCellNode(node)) {
                    keys.push(node.getKey());
                } else if (isElementNode(node)) {
                    node.getChildren().forEach(collect);
                }
            };
            getRoot().getChildren().forEach(collect);
        });
        for (const key of keys) {
            await juliaCellRunners.get(key)?.();
        }
    }

    // Re-theme the CodeMirror highlight whenever the app light/dark mode flips.
    $effect(() => {
        const dark = $appDarkMode;
        view?.dispatch({
            effects: highlightComp.reconfigure(highlightExt(dark)),
        });
    });

    const cellTheme = EditorView.theme({
        "&": {
            backgroundColor: "transparent",
            fontSize: "var(--julia-cell-code-font-size, 12px)",
            margin: "0",
        },
        "&.cm-focused": { outline: "none" },
        ".cm-scroller": {
            fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            lineHeight: "var(--julia-cell-code-line-height, 1.4)",
        },
        ".cm-content": {
            margin: "0",
            padding: "0",
            caretColor: "var(--julia-cell-caret, currentColor)",
        },
        ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "var(--julia-cell-caret, currentColor)",
        },
        ".cm-line": { paddingTop: "0", paddingBottom: "0" },
        ".cm-gutters": {
            backgroundColor: "transparent",
            border: "none",
            opacity: "0.4",
        },
        ".cm-activeLine": { backgroundColor: "transparent" },
        ".cm-activeLineGutter": { backgroundColor: "transparent" },
    });

    onMount(() => {
        if (!editorHost) return;

        const runKeymap = keymap.of([
            {
                key: "Mod-Enter",
                run: () => {
                    void run();
                    return true;
                },
            },
        ]);

        const state = EditorState.create({
            doc: code,
            extensions: [
                lineNumbers(),
                history(),
                runKeymap,
                latexInput,
                wrapSelection,
                keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
                juliaSupport,
                highlightComp.of(highlightExt($appDarkMode)),
                wrapComp.of(codeWrap ? EditorView.lineWrapping : []),
                cellTheme,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        editCode = update.state.doc.toString();
                    }
                    if (
                        update.selectionSet ||
                        update.docChanged ||
                        update.focusChanged
                    ) {
                        updateAiSelection();
                    }
                }),
            ],
        });

        view = new EditorView({ state, parent: editorHost });

        // Expose this cell's run handler so "Run all" can drive it, and its
        // clear handler so a kernel restart can wipe its output.
        juliaCellRunners.set(nodeKey, run);
        juliaCellClearers.set(nodeKey, clearOutput);

        if (autoEdit) {
            tick().then(() => view?.focus());
            editor.update(() => {
                const node = getNodeByKey(nodeKey);
                if (node && isJuliaCellNode(node)) {
                    node.setAutoEdit(false);
                }
            });
        }

        return () => {
            juliaCellRunners.delete(nodeKey);
            juliaCellClearers.delete(nodeKey);
            persistCode();
            view?.destroy();
            view = null;
        };
    });
</script>

<div
    class="julia-cell my-0.5 flex flex-col overflow-hidden rounded-md {plotUnboxed
        ? ''
        : 'border border-brand-sand-200 dark:border-[#363a4f]'}"
    class:julia-cell-selected={$isSelected}
    style="--julia-cell-code-font-size: {$juliaCellFontSize}px; --julia-cell-code-line-height: {$juliaCellLineHeight}; --julia-cell-caret: {caretColor}"
>
    <!-- Header + code input wrapper — when the output is shown unboxed, this
         keeps the sand border around just the header and code, not the plot. -->
    <div
        class={plotUnboxed
            ? "flex flex-col overflow-hidden rounded-md border border-brand-sand-200 dark:border-[#363a4f]"
            : "contents"}
    >
        <!-- Header — kept low-contrast so the block recedes behind the code -->
        <div
            class="relative flex items-center justify-between border-b border-brand-sand-200 dark:border-[#363a4f] px-2 py-0.5"
        >
            {#if running}
                <!-- Moving-gradient bar that overlays the header's bottom border
                     while the cell is executing. -->
                <div class="julia-cell-runbar" aria-hidden="true"></div>
            {/if}
            <span class="flex items-center gap-1.5 select-none">
                <span
                    class="font-sans text-[10px] font-medium uppercase tracking-wide text-brand-charcoal-300 dark:text-[#626880]"
                    >{$t("julia_cell.title")}</span
                >
                {#if hasRun}
                    <span
                        class="font-mono text-[10px] text-brand-charcoal-300 dark:text-[#626880]"
                        >[{runCount}]</span
                    >
                {/if}
            </span>

            <span class="flex items-center gap-1.5">
                <!-- Size-options toggle — collapses the font size / line height controls -->
                <button
                    onclick={() => (showSizeOptions = !showSizeOptions)}
                    title={showSizeOptions
                        ? "Hide text size options"
                        : "Show text size options"}
                    aria-pressed={showSizeOptions}
                    aria-label="Toggle text size options"
                    class="flex h-[22px] w-7 cursor-pointer items-center justify-center rounded-md border border-brand-sand-200 transition-colors dark:border-[#414559] {showSizeOptions
                        ? 'bg-brand-gold-200 text-brand-charcoal-900 dark:bg-[#414559] dark:text-[#c6d0f5]'
                        : 'text-brand-charcoal-300 hover:bg-brand-sand-100 hover:text-brand-charcoal-900 dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]'}"
                >
                    <Icon icon="tabler:text-size" width="0.8rem" />
                </button>

                {#if showSizeOptions}
                    <!-- Code font size -->
                    <span
                        class="flex h-[22px] items-center overflow-hidden rounded-md border border-brand-sand-200 dark:border-[#414559]"
                        title="Code font size"
                    >
                        <button
                            onclick={() => adjustCodeFontSize(-1)}
                            disabled={$juliaCellFontSize <= 9}
                            aria-label="Decrease code font size"
                            class="flex h-full w-[22px] cursor-pointer items-center justify-center text-brand-charcoal-300 transition-colors hover:bg-brand-sand-100 hover:text-brand-charcoal-900 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
                        >
                            <Icon icon="mdi:minus" width="0.7rem" />
                        </button>
                        <span
                            class="flex h-full min-w-[1.6rem] items-center justify-center border-x border-brand-sand-200 font-mono text-[10px] tabular-nums text-brand-charcoal-400 select-none dark:border-[#414559] dark:text-[#a5adce]"
                            >{$juliaCellFontSize}</span
                        >
                        <button
                            onclick={() => adjustCodeFontSize(1)}
                            disabled={$juliaCellFontSize >= 18}
                            aria-label="Increase code font size"
                            class="flex h-full w-[22px] cursor-pointer items-center justify-center text-brand-charcoal-300 transition-colors hover:bg-brand-sand-100 hover:text-brand-charcoal-900 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
                        >
                            <Icon icon="mdi:plus" width="0.7rem" />
                        </button>
                    </span>

                    <!-- Code line height -->
                    <span
                        class="flex h-[22px] items-center overflow-hidden rounded-md border border-brand-sand-200 dark:border-[#414559]"
                        title="Code line height"
                    >
                        <button
                            onclick={() => adjustCodeLineHeight(-0.1)}
                            disabled={$juliaCellLineHeight <= 1}
                            aria-label="Decrease code line height"
                            class="flex h-full w-[22px] cursor-pointer items-center justify-center text-brand-charcoal-300 transition-colors hover:bg-brand-sand-100 hover:text-brand-charcoal-900 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
                        >
                            <Icon
                                icon="fluent:arrow-autofit-height-in-24-filled"
                                width="0.78rem"
                            />
                        </button>
                        <span
                            class="flex h-full min-w-[1.9rem] items-center justify-center border-x border-brand-sand-200 font-mono text-[10px] tabular-nums text-brand-charcoal-400 select-none dark:border-[#414559] dark:text-[#a5adce]"
                            >{$juliaCellLineHeight.toFixed(1)}</span
                        >
                        <button
                            onclick={() => adjustCodeLineHeight(0.1)}
                            disabled={$juliaCellLineHeight >= 2.5}
                            aria-label="Increase code line height"
                            class="flex h-full w-[22px] cursor-pointer items-center justify-center text-brand-charcoal-300 transition-colors hover:bg-brand-sand-100 hover:text-brand-charcoal-900 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
                        >
                            <Icon
                                icon="fluent:arrow-autofit-height-24-filled"
                                width="0.78rem"
                            />
                        </button>
                    </span>
                {/if}

                <!-- Line wrap toggle -->
                <button
                    onclick={toggleWrap}
                    title={codeWrap ? "Disable line wrap" : "Enable line wrap"}
                    aria-pressed={codeWrap}
                    class="flex h-[22px] w-7 cursor-pointer items-center justify-center rounded-md border border-brand-sand-200 transition-colors dark:border-[#414559] {codeWrap
                        ? 'bg-brand-gold-200 text-brand-charcoal-900 dark:bg-[#414559] dark:text-[#c6d0f5]'
                        : 'text-brand-charcoal-300 hover:bg-brand-sand-100 hover:text-brand-charcoal-900 dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]'}"
                >
                    <Icon
                        icon={codeWrap
                            ? "tabler:text-wrap"
                            : "tabler:text-wrap-disabled"}
                        width="0.8rem"
                    />
                </button>

                <!-- Display-mode toggle -->
                <span
                    class="flex h-[22px] items-center overflow-hidden rounded-md border border-brand-sand-200 dark:border-[#414559]"
                >
                    {#each MODES as m (m.id)}
                        <button
                            onclick={() => setMode(m.id)}
                            title={$t(`julia_cell.mode_${m.id}`)}
                            aria-pressed={mode === m.id}
                            class="flex h-full w-7 cursor-pointer items-center justify-center transition-colors {mode ===
                            m.id
                                ? 'bg-brand-gold-200 text-brand-charcoal-900 dark:bg-[#414559] dark:text-[#c6d0f5]'
                                : 'text-brand-charcoal-300 hover:bg-brand-sand-100 hover:text-brand-charcoal-900 dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]'}"
                        >
                            <Icon icon={m.icon} width="0.8rem" />
                        </button>
                    {/each}
                </span>

                <!-- Restart kernel -->
                <button
                    onclick={restartKernel}
                    disabled={restarting}
                    title="Restart Julia kernel (clears all variables)"
                    aria-label="Restart Julia kernel"
                    class="flex h-[22px] w-7 cursor-pointer items-center justify-center rounded-md border border-brand-sand-200 text-brand-charcoal-300 transition-colors hover:bg-brand-sand-100 hover:text-brand-charcoal-900 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:border-[#414559] dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
                >
                    <Icon
                        icon="solar:restart-bold"
                        class={restarting ? "animate-spin" : ""}
                        width="0.8rem"
                    />
                </button>

                <!-- Run / Stop -->
                {#if running}
                    <button
                        onclick={stop}
                        title="Stop the running cell"
                        class="flex h-[22px] cursor-pointer items-center gap-1 rounded-md border border-red-200 px-2 font-sans text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                        <Icon icon="solar:stop-bold" width="0.7rem" />
                        {$t("julia_cell.stop")}
                    </button>
                {:else}
                    <!-- Run split button — main runs this cell, caret opens options -->
                    <span class="relative flex items-center">
                        <button
                            onclick={run}
                            title="{$t('julia_cell.run')} (Ctrl/Cmd+Enter)"
                            class="flex h-[22px] cursor-pointer items-center gap-1 rounded-l-md border border-r-0 border-brand-sand-200 px-2 font-sans text-[10px] font-semibold text-brand-gold-600 transition-colors hover:bg-brand-gold-100 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:border-[#414559] dark:text-brand-gold-400 dark:hover:bg-[#414559]"
                        >
                            <Icon icon="solar:play-bold" width="0.7rem" />
                            {$t("julia_cell.run")}
                        </button>
                        <button
                            onclick={toggleRunMenu}
                            title={$t("julia_cell.run_options")}
                            aria-label={$t("julia_cell.run_options")}
                            aria-expanded={showRunMenu}
                            class="flex h-[22px] w-5 cursor-pointer items-center justify-center rounded-r-md border border-brand-sand-200 text-brand-gold-600 transition-colors hover:bg-brand-gold-100 dark:border-[#414559] dark:text-brand-gold-400 dark:hover:bg-[#414559]"
                        >
                            <Icon icon="tabler:chevron-down" width="0.65rem" />
                        </button>

                        {#if showRunMenu}
                            <!-- Click-away backdrop -->
                            <button
                                class="fixed inset-0 z-[60] cursor-default"
                                aria-label="Close run menu"
                                onclick={() => (showRunMenu = false)}
                            ></button>
                            <div
                                class="fixed z-[61] flex min-w-[7rem] -translate-x-full flex-col overflow-hidden rounded-md border border-brand-sand-200 bg-white py-0.5 shadow-md dark:border-[#414559] dark:bg-[#292c3c]"
                                style="left: {runMenuPos.x}px; top: {runMenuPos.y}px;"
                            >
                                <button
                                    onclick={() => {
                                        showRunMenu = false;
                                        void run();
                                    }}
                                    class="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-left font-sans text-[10px] text-brand-charcoal-700 transition-colors hover:bg-brand-sand-100 dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                                >
                                    <Icon
                                        icon="solar:play-bold"
                                        width="0.7rem"
                                    />
                                    {$t("julia_cell.run_cell")}
                                </button>
                                <button
                                    onclick={runAll}
                                    class="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-left font-sans text-[10px] text-brand-charcoal-700 transition-colors hover:bg-brand-sand-100 dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                                >
                                    <Icon
                                        icon="solar:play-stream-bold"
                                        width="0.7rem"
                                    />
                                    {$t("julia_cell.run_all")}
                                </button>
                            </div>
                        {/if}
                    </span>
                {/if}
            </span>
        </div>

        <!-- Code input — host stays mounted (hidden) so the editor survives toggles -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- Stop keyboard/clipboard events from bubbling to the Lexical root —
         otherwise a paste into CodeMirror is also handled by Lexical, which
         inserts the same text as a paragraph below the cell. -->
        <div
            bind:this={editorHost}
            dir="ltr"
            onkeydown={(e) => e.stopPropagation()}
            onpaste={(e) => e.stopPropagation()}
            oncopy={(e) => e.stopPropagation()}
            oncut={(e) => e.stopPropagation()}
            class="julia-cell-editor px-2 py-1.5 bg-brand-sand-50 dark:bg-[#232634] text-brand-charcoal-900 dark:text-[#c6d0f5]"
            class:hidden={!showCode}
            style={!showCode ? "display:none" : ""}
        ></div>
    </div>
    <!-- end header + code input wrapper -->

    <!-- Output — only rendered when the run actually produced something, so a
         cell like `using Statistics` shows no empty output panel -->
    {#if showOutput && hasRun && (liveOutput || livePlots.length > 0)}
        <!-- The negative bottom margin is dropped for plots: with a white
             plot background it would bleed under the paragraphs below the
             cell, hiding the editor caret on empty lines. -->
        <div
            class="flow-root py-1 px-2 {livePlots.length > 0
                ? 'bg-white dark:bg-white'
                : '-mb-5.5 border-t border-brand-sand-200 dark:border-[#363a4f] bg-brand-sand-50 dark:bg-[#1e2030]'}"
            class:border-t-0={!showCode}
        >
            {#if liveOutput}
                <pre
                    class="m-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-tight {liveError
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-brand-charcoal-900 dark:text-[#c6d0f5]'}">{liveOutput}</pre>
            {/if}
            {#each livePlots as plot, i (plot.url ?? plot.data ?? i)}
                {#if plot.format === "html" && plot.url}
                    <!-- Interactive WGLMakie/Bonito plot served by the kernel.
                         allow-scripts + allow-same-origin are required for
                         WebGL and the Bonito WebSocket connection. -->
                    <iframe
                        class="mt-0.5 w-full rounded"
                        style="height: 420px;"
                        src={plot.url}
                        title={$t("julia_cell.plot_alt")}
                        sandbox="allow-scripts allow-same-origin"
                    ></iframe>
                {:else if plot.format === "plotly" && plot.data}
                    <!-- Interactive PlotlyJS figure — a self-contained HTML
                         document embedded via srcdoc. allow-scripts runs the
                         inline Plotly bootstrap; allow-same-origin lets it
                         load the Plotly library. -->
                    <iframe
                        class="mt-0.5 w-full rounded"
                        style="height: 520px;"
                        srcdoc={plotlyIframeDoc(plot.data)}
                        title={$t("julia_cell.plot_alt")}
                        sandbox="allow-scripts allow-same-origin"
                    ></iframe>
                {:else if plot.format === "svg" && plot.data}
                    <div class="mt-0.5 max-w-full overflow-auto">
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                        {@html atob(plot.data)}
                    </div>
                {:else if plot.data}
                    <img
                        class="mt-0.5 max-w-full rounded"
                        src="data:image/png;base64,{plot.data}"
                        alt={$t("julia_cell.plot_alt")}
                    />
                {/if}
            {/each}
            {#if !liveOutput && livePlots.length === 0 && !running}
                <!-- <span
                    class="julia-cell-empty-output font-mono text-[11px] leading-tight italic text-brand-charcoal-300 dark:text-[#626880]"
                    >{$t("julia_cell.no_output")}</span
                > -->
            {/if}
        </div>
    {/if}

    {#if $isPro && aiSelection}
        <AiSelectionToolbar
            selectedText={aiSelection.text}
            x={aiSelection.x}
            y={aiSelection.y}
            contextPrompt={`This text is a selection from a Julia code cell. Full cell source:\n\n${editCode}`}
            onReplace={replaceAiSelection}
            onClose={() => (aiSelection = null)}
        />
    {/if}
</div>

<style>
    .julia-cell-editor :global(.cm-editor) {
        margin-block: 0 !important;
    }

    .julia-cell-editor[style*="display:none"] {
        display: none !important;
        margin: 0 !important;
        padding: 0 !important;
    }

    .julia-cell-output :global(pre) {
        font-size: var(--julia-cell-code-font-size, 12px);
        margin: 0;
    }

    .julia-cell-output :global(.julia-cell-empty-output) {
        font-size: var(--julia-cell-code-font-size, 12px);
    }

    .julia-cell-selected {
        outline: 2px solid rgba(99, 130, 233, 0.45);
    }

    /* Running indicator — a thin moving gradient sitting on top of the header's
       bottom border. Uses brand gold tones in light mode and a softened pastel
       palette in dark mode so it reads as activity, not an error. */
    .julia-cell-runbar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: -1px;
        height: 1.5px;
        pointer-events: none;
        background-image: linear-gradient(
            90deg,
            transparent 0%,
            var(--color-brand-gold-400) 30%,
            var(--color-brand-gold-500) 50%,
            var(--color-brand-gold-400) 70%,
            transparent 100%
        );
        background-size: 200% 100%;
        background-repeat: no-repeat;
        animation: julia-cell-runbar 1.4s linear infinite;
    }

    :global(.dark) .julia-cell-runbar {
        background-image: linear-gradient(
            90deg,
            transparent 0%,
            #8caaee 30%,
            #e5c890 50%,
            #8caaee 70%,
            transparent 100%
        );
    }

    @keyframes julia-cell-runbar {
        0% {
            background-position: -100% 0;
        }
        100% {
            background-position: 200% 0;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .julia-cell-runbar {
            animation: none;
            background-position: 50% 0;
        }
    }
</style>
