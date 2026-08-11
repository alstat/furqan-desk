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
        $getSelection as getSelection,
        $isElementNode as isElementNode,
        $isNodeSelection as isNodeSelection,
        CLICK_COMMAND,
        KEY_DELETE_COMMAND,
        KEY_BACKSPACE_COMMAND,
        COMMAND_PRIORITY_LOW,
        type LexicalNode,
    } from "lexical";
    import { mergeRegister } from "@lexical/utils";
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
        registerJuliaPlotIframe,
        type JuliaCellPlot,
    } from "$lib/stores/julia-notebook";
    import {
        juliaSupport,
        juliaLightHighlight,
        juliaDarkHighlight,
    } from "$lib/codemirror/julia";
    import { latexInput } from "$lib/codemirror/latexInput";
    import { wrapSelection } from "$lib/codemirror/wrapSelection";
    import { clearSelection, createNodeSelectionStore } from "../../nodeSelectionStore.js";
    import { appDarkMode, editorIndentSize } from "$lib/stores/editor.store";
    import { get } from "svelte/store";
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

    // Svelte action — keeps the global iframe registry in sync with whatever
    // plots are currently mounted, so the DOCX exporter can read the live
    // (rotated/panned/zoomed) state of interactive Plotly/Gadfly/WGLMakie
    // figures at export time.
    function trackPlotIframe(node: HTMLIFrameElement, key: string) {
        let currentKey = key;
        registerJuliaPlotIframe(currentKey, node);
        return {
            update(nextKey: string) {
                if (nextKey === currentKey) return;
                registerJuliaPlotIframe(currentKey, null);
                currentKey = nextKey;
                registerJuliaPlotIframe(currentKey, node);
            },
            destroy() {
                registerJuliaPlotIframe(currentKey, null);
            },
        };
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

    // ── Julia formatter ───────────────────────────────────────────────────────
    let formatting = $state(false);
    let formatError = $state("");
    let formatErrorTimer: ReturnType<typeof setTimeout> | null = null;

    function showFormatError(msg: string) {
        formatError = msg;
        if (formatErrorTimer) clearTimeout(formatErrorTimer);
        formatErrorTimer = setTimeout(() => (formatError = ""), 8000);
    }

    // UTF-8 ⇄ base64 — the formatter request carries the source through the
    // line-based REPL protocol, so it must be encoded to a single line.
    function utf8ToB64(s: string): string {
        const bytes = new TextEncoder().encode(s);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) {
            bin += String.fromCharCode(bytes[i]);
        }
        return btoa(bin);
    }
    function b64ToUtf8(b64: string): string {
        const bin = atob(b64);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }

    async function formatJulia() {
        if (!view || formatting) return;
        const code = view.state.doc.toString();
        if (!code.trim()) return;
        formatting = true;
        formatError = "";
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const line = await invoke<string>("julia_format", {
                codeB64: utf8ToB64(code),
                indent: get(editorIndentSize),
                kernel: "cell",
            });
            if (line.startsWith("OK:")) {
                const formatted = b64ToUtf8(line.slice(3));
                if (formatted !== view.state.doc.toString()) {
                    view.dispatch({
                        changes: {
                            from: 0,
                            to: view.state.doc.length,
                            insert: formatted,
                        },
                    });
                    editCode = formatted;
                    persistCode();
                }
            } else if (line.startsWith("ERR:")) {
                showFormatError(b64ToUtf8(line.slice(4)));
            } else {
                showFormatError("Unexpected formatter response.");
            }
        } catch (e) {
            showFormatError(typeof e === "string" ? e : String(e));
        } finally {
            formatting = false;
        }
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
            // Kernel info reflects the live kernel — drop it so the next open
            // re-probes the fresh process.
            kernelInfoText = "";
            kernelInfoError = "";
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

    // ── Kernel info dialog ────────────────────────────────────────────────────
    // Runs `versioninfo()` plus the active project path inside the cell
    // kernel and renders the captured text in a modal. Results are cached
    // for the lifetime of the component since they don't change unless the
    // kernel restarts; restartKernel() invalidates the cache.
    let showKernelInfo = $state(false);
    let kernelInfoLoading = $state(false);
    let kernelInfoText = $state("");
    let kernelInfoError = $state("");

    async function openKernelInfo() {
        showRunMenu = false;
        showKernelInfo = true;
        if (kernelInfoText || kernelInfoLoading) return;
        kernelInfoLoading = true;
        kernelInfoError = "";
        const probe = `import InteractiveUtils
let
    io = IOBuffer()
    InteractiveUtils.versioninfo(io)
    proj = try Base.active_project() catch; nothing end
    println(io)
    println(io, "Active project: ", proj === nothing ? "(none)" : proj)
    print(String(take!(io)))
end
`;
        try {
            const result = await runJuliaCell(probe, () => {});
            if (result.hasError) {
                kernelInfoError =
                    result.text || "Failed to read kernel info.";
            } else {
                kernelInfoText = result.text.trim();
            }
        } catch (e) {
            kernelInfoError = typeof e === "string" ? e : String(e);
        } finally {
            kernelInfoLoading = false;
        }
    }

    function closeKernelInfo() {
        showKernelInfo = false;
    }

    function onKernelInfoKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") closeKernelInfo();
    }

    function onKernelInfoBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) closeKernelInfo();
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

    // Root element of the rendered cell — used to detect clicks on the cell's
    // chrome (border, header, output) so the whole node can be selected.
    let wrapperEl: HTMLElement | null = $state(null);

    // Clicking the cell — anywhere except the code editor or an interactive
    // control — selects the whole node, so a following Delete/Backspace removes
    // it. Shift-click toggles, matching the image/decorator selection pattern.
    const onCellClick = (payload: MouseEvent): boolean => {
        const target = payload.target as HTMLElement | null;
        if (!target || !wrapperEl || !wrapperEl.contains(target)) return false;
        // Editing the code or using a control must keep their normal behaviour.
        if (editorHost?.contains(target)) return false;
        if (target.closest("button, a, input, select, textarea, iframe"))
            return false;

        if (payload.shiftKey) {
            $isSelected = !$isSelected;
        } else {
            clearSelection(editor);
            $isSelected = true;
        }
        return true;
    };

    // Delete/Backspace removes the cell, but only when it is node-selected (so
    // the keys still edit text normally while the code editor has focus).
    const onCellDelete = (event: KeyboardEvent): boolean => {
        if (!$isSelected || !isNodeSelection(getSelection())) return false;
        event.preventDefault();
        const node = getNodeByKey(nodeKey);
        if (isJuliaCellNode(node)) {
            node.remove();
            return true;
        }
        return false;
    };

    onMount(() => {
        const unregisterCommands = mergeRegister(
            editor.registerCommand(
                CLICK_COMMAND,
                onCellClick,
                COMMAND_PRIORITY_LOW,
            ),
            editor.registerCommand(
                KEY_DELETE_COMMAND,
                onCellDelete,
                COMMAND_PRIORITY_LOW,
            ),
            editor.registerCommand(
                KEY_BACKSPACE_COMMAND,
                onCellDelete,
                COMMAND_PRIORITY_LOW,
            ),
        );

        if (!editorHost) return unregisterCommands;

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
            unregisterCommands();
            juliaCellRunners.delete(nodeKey);
            juliaCellClearers.delete(nodeKey);
            persistCode();
            view?.destroy();
            view = null;
        };
    });
</script>

<div
    bind:this={wrapperEl}
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
                        ? $t("julia_cell.hide_text_size_options")
                        : $t("julia_cell.show_text_size_options")}
                    aria-pressed={showSizeOptions}
                    aria-label={$t("julia_cell.toggle_text_size_options")}
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
                        title={$t("julia_cell.code_font_size")}
                    >
                        <button
                            onclick={() => adjustCodeFontSize(-1)}
                            disabled={$juliaCellFontSize <= 9}
                            aria-label={$t("julia_cell.decrease_code_font_size")}
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
                            aria-label={$t("julia_cell.increase_code_font_size")}
                            class="flex h-full w-[22px] cursor-pointer items-center justify-center text-brand-charcoal-300 transition-colors hover:bg-brand-sand-100 hover:text-brand-charcoal-900 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
                        >
                            <Icon icon="mdi:plus" width="0.7rem" />
                        </button>
                    </span>

                    <!-- Code line height -->
                    <span
                        class="flex h-[22px] items-center overflow-hidden rounded-md border border-brand-sand-200 dark:border-[#414559]"
                        title={$t("julia_cell.code_line_height")}
                    >
                        <button
                            onclick={() => adjustCodeLineHeight(-0.1)}
                            disabled={$juliaCellLineHeight <= 1}
                            aria-label={$t("julia_cell.decrease_code_line_height")}
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
                            aria-label={$t("julia_cell.increase_code_line_height")}
                            class="flex h-full w-[22px] cursor-pointer items-center justify-center text-brand-charcoal-300 transition-colors hover:bg-brand-sand-100 hover:text-brand-charcoal-900 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
                        >
                            <Icon
                                icon="fluent:arrow-autofit-height-24-filled"
                                width="0.78rem"
                            />
                        </button>
                    </span>
                {/if}

                <!-- Julia formatter -->
                <button
                    onclick={formatJulia}
                    disabled={formatting}
                    title={$t("julia_cell.format")}
                    aria-label={$t("julia_cell.format_code")}
                    class="flex h-[22px] w-7 cursor-pointer items-center justify-center rounded-md border border-brand-sand-200 text-brand-charcoal-300 transition-colors hover:bg-brand-sand-100 hover:text-brand-charcoal-900 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:border-[#414559] dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
                >
                    <Icon
                        icon="icon-park-twotone:format-brush"
                        class={formatting ? "animate-pulse" : ""}
                        width="0.8rem"
                    />
                </button>

                <!-- Line wrap toggle -->
                <button
                    onclick={toggleWrap}
                    title={codeWrap
                        ? $t("julia_cell.disable_wrap")
                        : $t("julia_cell.enable_wrap")}
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
                    title={$t("julia_cell.restart_kernel_clear")}
                    aria-label={$t("julia_cell.restart_kernel")}
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
                        title={$t("julia_cell.stop_running")}
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
                                aria-label={$t("julia_cell.close_run_menu")}
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
                                <div
                                    class="my-0.5 h-px bg-brand-sand-200 dark:bg-[#414559]"
                                ></div>
                                <button
                                    onclick={openKernelInfo}
                                    class="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-left font-sans text-[10px] text-brand-charcoal-700 transition-colors hover:bg-brand-sand-100 dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                                >
                                    <Icon
                                        icon="solar:info-circle-bold"
                                        width="0.7rem"
                                    />
                                    {$t("julia_cell.kernel_info")}
                                </button>
                            </div>
                        {/if}
                    </span>
                {/if}
            </span>
        </div>

        {#if formatError}
            {@const isReplDown =
                /repl|kernel|not started|not running|connect/i.test(
                    formatError,
                )}
            <div
                role="alert"
                class="julia-format-alert font-sans mx-2 mt-1.5 mb-1.5 flex items-start gap-2 px-2.5 py-2
                       rounded-md border shadow-sm
                       {isReplDown
                    ? 'bg-amber-50/90 dark:bg-amber-900/15 border-amber-200/80 dark:border-amber-700/40'
                    : 'bg-red-50/90 dark:bg-red-900/15 border-red-200/80 dark:border-red-700/40'}"
            >
                <span
                    class="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full
                           {isReplDown
                        ? 'bg-amber-100 dark:bg-amber-800/40 text-amber-600 dark:text-amber-300'
                        : 'bg-red-100 dark:bg-red-800/40 text-red-600 dark:text-red-300'}"
                >
                    <Icon
                        icon={isReplDown
                            ? "lucide:plug-zap"
                            : "lucide:alert-triangle"}
                        width="0.7rem"
                        height="0.7rem"
                    />
                </span>
                <div class="min-w-0 flex-1 leading-tight">
                    <div
                        class="text-[11px] font-semibold
                               {isReplDown
                            ? 'text-amber-800 dark:text-amber-200'
                            : 'text-red-700 dark:text-red-200'}"
                    >
                        {isReplDown
                            ? $t("julia_cell.repl_not_running")
                            : $t("julia_cell.format_failed")}
                    </div>
                    <div
                        class="-mt-3 text-[10.5px] break-words
                               {isReplDown
                            ? 'text-amber-700/90 dark:text-amber-300/90'
                            : 'text-red-600/90 dark:text-red-300/90'}"
                    >
                        {isReplDown
                            ? $t("julia_cell.start_kernel_then_format")
                            : formatError}
                    </div>
                </div>
                <button
                    type="button"
                    aria-label={$t("common.close")}
                    onclick={() => {
                        formatError = "";
                        if (formatErrorTimer) clearTimeout(formatErrorTimer);
                    }}
                    class="shrink-0 -mr-0.5 -mt-0.5 p-1 rounded
                           text-current opacity-60 hover:opacity-100
                           hover:bg-black/5 dark:hover:bg-white/10 transition"
                >
                    <Icon icon="lucide:x" width="0.7rem" height="0.7rem" />
                </button>
            </div>
        {/if}

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
                        use:trackPlotIframe={plot.url}
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
                        use:trackPlotIframe={plot.data}
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

{#if showKernelInfo}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="julia-kernel-info-backdrop fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onclick={onKernelInfoBackdropClick}
        onkeydown={onKernelInfoKeydown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="julia-kernel-info-title"
        tabindex="-1"
    >
        <div
            class="julia-kernel-info-panel font-sans flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40"
        >
            <!-- Header — matches JuliaPlotViewer -->
            <div
                class="flex items-center justify-between px-4 py-1.75 shrink-0
                       border-b border-brand-gold-200 dark:border-[#414559]
                       bg-brand-gold-100 dark:bg-[#292c3c]
                       select-none rounded-t-2xl"
                role="banner"
            >
                <div class="flex items-center gap-2">
                    <Icon
                        icon="solar:cpu-bolt-bold-duotone"
                        width="1.1rem"
                        class="text-brand-gold-500"
                    />
                    <span
                        id="julia-kernel-info-title"
                        class="text-[11px] py-2 font-semibold uppercase tracking-wide
                               text-brand-charcoal-500 dark:text-[#838ba7]"
                    >
                        {$t("julia_cell.kernel_info_title")}
                    </span>
                </div>

                <button
                    onclick={closeKernelInfo}
                    class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg
                           bg-brand-gold-200 dark:bg-[#414559]
                           text-brand-gold-600 dark:text-[#c6d0f5]
                           hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    aria-label={$t("common.close")}
                    title={$t("common.close")}
                >
                    <Icon
                        icon="solar:close-circle-bold-duotone"
                        width="0.85rem"
                    />
                </button>
            </div>

            <!-- Body -->
            <div class="px-4 py-3 max-h-[60vh] overflow-y-auto">
                {#if kernelInfoLoading}
                    <div
                        class="flex items-center gap-2 text-[12px] text-brand-charcoal-600 dark:text-[#a5adcb]"
                    >
                        <Icon icon="svg-spinners:180-ring" width="0.9rem" />
                        {$t("julia_cell.probing_kernel")}
                    </div>
                {:else if kernelInfoError}
                    <div
                        class="rounded-md border border-red-200/80 dark:border-red-700/40 bg-red-50/90 dark:bg-red-900/15 px-3 py-2 text-[11.5px] text-red-700 dark:text-red-200 whitespace-pre-wrap break-words"
                    >
                        {kernelInfoError}
                    </div>
                {:else if kernelInfoText}
                    <pre
                        class="m-0 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-snug text-brand-charcoal-800 dark:text-[#c6d0f5]">{kernelInfoText}</pre>
                {:else}
                    <div
                        class="text-[12px] text-brand-charcoal-500 dark:text-[#a5adcb]"
                    >
                        {$t("julia_cell.no_kernel_info")}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .julia-format-alert {
        animation: julia-format-alert-in 160ms ease-out;
    }
    @keyframes julia-format-alert-in {
        from {
            opacity: 0;
            transform: translateY(-2px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .julia-kernel-info-backdrop {
        animation: julia-kernel-info-fade 140ms ease-out;
    }
    .julia-kernel-info-panel {
        animation: julia-kernel-info-rise 180ms ease-out;
    }
    @keyframes julia-kernel-info-fade {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @keyframes julia-kernel-info-rise {
        from {
            opacity: 0;
            transform: translateY(6px) scale(0.98);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

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
