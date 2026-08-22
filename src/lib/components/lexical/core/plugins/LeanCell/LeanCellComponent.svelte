<script lang="ts">
    import { onMount, tick } from "svelte";
    import Icon from "@iconify/svelte";
    // Registers the cell's icons offline so they render without the Iconify API.
    import "$lib/icons/lean-cell-icons";
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
        $isLeanCellNode as isLeanCellNode,
        type LeanCellDisplayMode,
    } from "./LeanCellNode";
    import {
        runLeanCell,
        cancelLeanCells,
        leanCellFontSize,
        leanCellLineHeight,
        leanCellLiveCompile,
        leanCellRunners,
        leanCellClearers,
        type LeanCellResult,
    } from "$lib/stores/lean-notebook";
    import {
        sortDiagnostics,
        countBySeverity,
        LIVE_COMPILE_DEBOUNCE_MS,
        type LeanDiagnostic,
        type LeanSeverity,
    } from "$lib/stores/lean-compiler.store";
    import {
        isLeanInstalled,
        openLeanInstallPrompt,
    } from "$lib/stores/lean-install.store";
    import {
        leanSupport,
        leanLightHighlight,
        leanDarkHighlight,
    } from "$lib/codemirror/lean";
    import { leanInput } from "$lib/codemirror/latexInput";
    import { wrapSelection } from "$lib/codemirror/wrapSelection";
    import {
        clearSelection,
        createNodeSelectionStore,
    } from "../../nodeSelectionStore.js";
    import { appDarkMode, editorIndentSize } from "$lib/stores/editor.store";
    import { formatLeanSource } from "$lib/utils/leanFormat";
    import { isPro } from "$lib/stores/auth.store";
    import AiSelectionToolbar from "$lib/components/shared/AiSelectionToolbar.svelte";
    import { t } from "$lib/i18n";

    interface Props {
        code?: string;
        diagnostics?: LeanDiagnostic[];
        raw?: string;
        ok?: boolean;
        elapsedMs?: number;
        displayMode?: LeanCellDisplayMode;
        nodeKey?: string;
        autoEdit?: boolean;
    }

    let {
        code = "",
        diagnostics = [],
        raw = "",
        ok = true,
        elapsedMs = 0,
        displayMode = "both",
        nodeKey = "",
        autoEdit = false,
    }: Props = $props();

    const editor = getEditor();
    const isSelected = createNodeSelectionStore(editor, nodeKey);

    // Editable source and the result currently shown beneath it. Seeded from
    // the node's persisted state so reloading a document keeps prior output.
    let editCode = $state(code);
    let liveDiagnostics = $state<LeanDiagnostic[]>(diagnostics);
    let liveRaw = $state(raw);
    let liveOk = $state(ok);
    let liveElapsed = $state(elapsedMs);
    let running = $state(false);
    let runCount = $state(0);
    let mode = $state<LeanCellDisplayMode>(displayMode);
    let codeWrap = $state(true);
    // Font size / line height controls stay collapsed by default — typically
    // set once when the cell is created and rarely touched after.
    let showSizeOptions = $state(false);

    let hasRun = $derived(
        runCount > 0 || diagnostics.length > 0 || raw !== "",
    );
    let showCode = $derived(mode !== "output");
    let showOutput = $derived(mode !== "code");

    let sorted = $derived(sortDiagnostics(liveDiagnostics));
    let counts = $derived(countBySeverity(liveDiagnostics));

    // Caret colour follows the app theme — matches the code text in each mode.
    let caretColor = $derived($appDarkMode ? "#c6d0f5" : "#2f2f2f");

    let editorHost: HTMLDivElement | null = $state(null);
    let view: EditorView | null = null;
    const highlightComp = new Compartment();
    const wrapComp = new Compartment();

    const SEVERITY_STYLE: Record<
        LeanSeverity,
        { icon: string; label: string; text: string }
    > = {
        error: {
            icon: "lucide:x-circle",
            label: "lean_infoview.error",
            text: "text-red-600 dark:text-red-400",
        },
        warning: {
            icon: "lucide:alert-triangle",
            label: "lean_infoview.warning",
            text: "text-amber-600 dark:text-amber-400",
        },
        information: {
            icon: "lucide:info",
            label: "lean_infoview.information",
            text: "text-sky-600 dark:text-sky-400",
        },
    };

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

    // ── Lean formatter ────────────────────────────────────────────────────────
    // Whitespace only — see leanFormat.ts for why it stops short of the
    // re-indenting the Julia formatter does.
    function formatLean() {
        if (!view) return;
        const source = view.state.doc.toString();
        if (!source.trim()) return;
        const formatted = formatLeanSource(source, {
            indentSize: $editorIndentSize,
        });
        if (formatted === source) return;
        // Full-document replace, kept in the cell's undo history.
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: formatted },
        });
        editCode = formatted;
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

    const MODES: { id: LeanCellDisplayMode; icon: string }[] = [
        { id: "both", icon: "tabler:layout-rows" },
        { id: "code", icon: "tabler:code" },
        { id: "output", icon: "tabler:terminal-2" },
    ];

    function highlightExt(dark: boolean) {
        return syntaxHighlighting(dark ? leanDarkHighlight : leanLightHighlight);
    }

    function persistCode() {
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (node && isLeanCellNode(node)) {
                node.setCode(editCode);
            }
        });
    }

    function setMode(next: LeanCellDisplayMode) {
        mode = next;
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (node && isLeanCellNode(node)) {
                node.setDisplayMode(next);
            }
        });
        // CodeMirror needs to re-measure after being un-hidden.
        if (next !== "output") {
            tick().then(() => view?.requestMeasure());
        }
    }

    // Font size / line height are shared across all cells via global stores, so
    // adjusting one cell re-styles every cell.
    function adjustCodeFontSize(delta: number) {
        leanCellFontSize.update((v) => Math.min(18, Math.max(9, v + delta)));
    }

    function adjustCodeLineHeight(delta: number) {
        leanCellLineHeight.update((v) => {
            const next = Math.round((v + delta) * 10) / 10;
            return Math.min(2.5, Math.max(1, next));
        });
    }

    // Re-measure CodeMirror whenever the shared display prefs change — fires in
    // every mounted cell, not just the one whose header was clicked.
    $effect(() => {
        void $leanCellFontSize;
        void $leanCellLineHeight;
        tick().then(() => view?.requestMeasure());
    });

    function applyResult(result: LeanCellResult) {
        liveDiagnostics = result.diagnostics;
        liveRaw = result.raw;
        liveOk = result.ok;
        liveElapsed = result.elapsedMs;

        // Persist onto the node so it survives serialization.
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (node && isLeanCellNode(node)) {
                node.setResult(
                    result.diagnostics,
                    result.raw,
                    result.ok,
                    result.elapsedMs,
                );
            }
        });
    }

    /** `force` re-runs even when the source is unchanged — see the runtime's
     *  `compile`. Live mode leaves it off so an idle pause costs nothing. */
    async function run(force = false) {
        if (running) {
            // In live mode an edit that lands mid-compile would otherwise be
            // dropped, leaving the shown messages describing stale source.
            // Re-arm the debounce so the newest text still gets compiled.
            if ($leanCellLiveCompile) scheduleLiveRun();
            return;
        }
        if (!editCode.trim()) return;
        // Check the toolchain first so a user without Lean sees the install
        // offer rather than a raw error string in the message list.
        if (!(await isLeanInstalled())) {
            openLeanInstallPrompt();
            return;
        }
        running = true;
        persistCode();
        try {
            const result = await runLeanCell(editCode, force);
            if (result) {
                applyResult(result);
                runCount += 1;
            }
        } finally {
            running = false;
        }
    }

    // Live compilation for the cells. The toggle is document-wide, so every
    // mounted cell watches it; each cell only recompiles its own source, and
    // the shared queue keeps the runtime handling one at a time.
    let liveTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleLiveRun() {
        if (liveTimer !== null) clearTimeout(liveTimer);
        liveTimer = setTimeout(() => {
            liveTimer = null;
            void run();
        }, LIVE_COMPILE_DEBOUNCE_MS);
    }

    $effect(() => {
        const source = editCode;
        const live = $leanCellLiveCompile;
        if (!live || !source.trim()) return;
        scheduleLiveRun();
    });

    /** Stop the compile in flight (and anything this cell has pending). */
    async function stop() {
        if (liveTimer !== null) {
            clearTimeout(liveTimer);
            liveTimer = null;
        }
        if (!running) return;
        await cancelLeanCells();
        running = false;
    }

    // Wipe this cell's result and run count, and clear the persisted result on
    // the node so nothing stale is left behind.
    function clearOutput() {
        liveDiagnostics = [];
        liveRaw = "";
        liveOk = true;
        liveElapsed = 0;
        runCount = 0;
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (node && isLeanCellNode(node)) {
                node.setResult([], "", true, 0);
            }
        });
    }

    // Run-button split menu — lets the user pick "Run cell" vs "Run all".
    // Positioned `fixed` (anchored at open time) so it isn't clipped by the
    // cell's overflow-hidden container.
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

    // Compile every Lean cell in the document, in document order. Each cell's
    // own run() drives its UI and persists its result; the shared queue keeps
    // execution strictly sequential.
    async function runAll() {
        showRunMenu = false;
        const keys: string[] = [];
        editor.getEditorState().read(() => {
            const collect = (node: LexicalNode) => {
                if (isLeanCellNode(node)) {
                    keys.push(node.getKey());
                } else if (isElementNode(node)) {
                    node.getChildren().forEach(collect);
                }
            };
            getRoot().getChildren().forEach(collect);
        });
        for (const key of keys) {
            await leanCellRunners.get(key)?.();
        }
    }

    function clearAllOutputs() {
        showRunMenu = false;
        leanCellClearers.forEach((clear) => clear());
    }

    // ── Toolchain info dialog ─────────────────────────────────────────────────
    // Compiles a tiny probe against the cell runtime and shows what Lean
    // reported. Cached for the component's lifetime — the toolchain doesn't
    // change under a running app unless the user reinstalls.
    let showToolchainInfo = $state(false);
    let toolchainLoading = $state(false);
    let toolchainText = $state("");
    let toolchainError = $state("");

    async function openToolchainInfo() {
        showRunMenu = false;
        showToolchainInfo = true;
        if (toolchainText || toolchainLoading) return;
        toolchainLoading = true;
        toolchainError = "";
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const version = await invoke<string>("get_lean_version");
            const path = await invoke<string>("get_lean_path");
            toolchainText = [
                `Lean version: ${version}`,
                `Binary: ${path || "(auto-detected)"}`,
                `Cell runtime kernel: cell`,
            ].join("\n");
        } catch (e) {
            toolchainError = typeof e === "string" ? e : String(e);
        } finally {
            toolchainLoading = false;
        }
    }

    function closeToolchainInfo() {
        showToolchainInfo = false;
    }

    function onToolchainKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") closeToolchainInfo();
    }

    function onToolchainBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) closeToolchainInfo();
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
            fontSize: "var(--lean-cell-code-font-size, 12px)",
            margin: "0",
        },
        "&.cm-focused": { outline: "none" },
        ".cm-scroller": {
            fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            lineHeight: "var(--lean-cell-code-line-height, 1.4)",
        },
        ".cm-content": {
            margin: "0",
            padding: "0",
            caretColor: "var(--lean-cell-caret, currentColor)",
        },
        ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "var(--lean-cell-caret, currentColor)",
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
        if (isLeanCellNode(node)) {
            node.remove();
            return true;
        }
        return false;
    };

    // Lean reports 1-based lines and 0-based columns; the gutter shows 1-based
    // columns, so present positions the way the editor does.
    function positionLabel(d: LeanDiagnostic): string {
        return `${d.line}:${d.column + 1}`;
    }

    /** Move this cell's caret to a diagnostic's position. */
    function jumpTo(d: LeanDiagnostic) {
        if (!view) return;
        if (mode === "output") setMode("both");
        const lineNo = Math.max(1, Math.min(view.state.doc.lines, d.line));
        const docLine = view.state.doc.line(lineNo);
        const pos = Math.min(docLine.from + d.column, docLine.to);
        tick().then(() => {
            view?.dispatch({
                selection: { anchor: pos },
                scrollIntoView: true,
            });
            view?.focus();
        });
    }

    function formatElapsed(ms: number): string {
        return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
    }

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
                    void run(true);
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
                // `\alpha`+Tab → α, `\N` → ℕ, `\<` → ⟨. Lean source is
                // unicode-heavy and its own editors offer the same
                // abbreviation input, so it belongs here.
                leanInput,
                wrapSelection,
                keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
                leanSupport,
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
        // clear handler so "clear all outputs" can wipe it.
        leanCellRunners.set(nodeKey, () => run(true));
        leanCellClearers.set(nodeKey, clearOutput);

        if (autoEdit) {
            tick().then(() => view?.focus());
            editor.update(() => {
                const node = getNodeByKey(nodeKey);
                if (node && isLeanCellNode(node)) {
                    node.setAutoEdit(false);
                }
            });
        }

        return () => {
            unregisterCommands();
            if (liveTimer !== null) clearTimeout(liveTimer);
            leanCellRunners.delete(nodeKey);
            leanCellClearers.delete(nodeKey);
            persistCode();
            view?.destroy();
            view = null;
        };
    });
</script>

<div
    bind:this={wrapperEl}
    class="lean-cell my-0.5 flex flex-col overflow-hidden rounded-md border border-brand-sand-200 dark:border-[#363a4f]"
    class:lean-cell-selected={$isSelected}
    style="--lean-cell-code-font-size: {$leanCellFontSize}px; --lean-cell-code-line-height: {$leanCellLineHeight}; --lean-cell-caret: {caretColor}"
>
    <!-- Header — kept low-contrast so the block recedes behind the code -->
    <div
        class="relative flex items-center justify-between border-b border-brand-sand-200 dark:border-[#363a4f] px-2 py-0.5"
    >
        {#if running}
            <!-- Moving-gradient bar overlaying the header's bottom border
                 while the cell is compiling. -->
            <div class="lean-cell-runbar" aria-hidden="true"></div>
        {/if}
        <span class="flex items-center gap-1.5 select-none">
            <span
                class="font-sans text-[10px] font-medium uppercase tracking-wide text-brand-charcoal-300 dark:text-[#626880]"
                >{$t("lean_cell.title")}</span
            >
            {#if hasRun}
                <span
                    class="font-mono text-[10px] text-brand-charcoal-300 dark:text-[#626880]"
                    >[{runCount}]</span
                >
                {#if counts.errors > 0}
                    <span
                        class="flex items-center gap-0.5 font-mono text-[10px] text-red-600 dark:text-red-400"
                    >
                        <Icon icon="lucide:x-circle" width="0.6rem" />
                        {counts.errors}
                    </span>
                {:else if liveOk}
                    <span
                        class="flex items-center gap-0.5 font-mono text-[10px] text-green-600 dark:text-green-400"
                    >
                        <Icon icon="lucide:check" width="0.6rem" />
                    </span>
                {/if}
                {#if counts.warnings > 0}
                    <span
                        class="flex items-center gap-0.5 font-mono text-[10px] text-amber-600 dark:text-amber-400"
                    >
                        <Icon icon="lucide:alert-triangle" width="0.6rem" />
                        {counts.warnings}
                    </span>
                {/if}
            {/if}
        </span>

        <span class="flex items-center gap-1.5">
            <!-- Size-options toggle -->
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
                        disabled={$leanCellFontSize <= 9}
                        aria-label={$t("julia_cell.decrease_code_font_size")}
                        class="flex h-full w-[22px] cursor-pointer items-center justify-center text-brand-charcoal-300 transition-colors hover:bg-brand-sand-100 hover:text-brand-charcoal-900 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
                    >
                        <Icon icon="mdi:minus" width="0.7rem" />
                    </button>
                    <span
                        class="flex h-full min-w-[1.6rem] items-center justify-center border-x border-brand-sand-200 font-mono text-[10px] tabular-nums text-brand-charcoal-400 select-none dark:border-[#414559] dark:text-[#a5adce]"
                        >{$leanCellFontSize}</span
                    >
                    <button
                        onclick={() => adjustCodeFontSize(1)}
                        disabled={$leanCellFontSize >= 18}
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
                        disabled={$leanCellLineHeight <= 1}
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
                        >{$leanCellLineHeight.toFixed(1)}</span
                    >
                    <button
                        onclick={() => adjustCodeLineHeight(0.1)}
                        disabled={$leanCellLineHeight >= 2.5}
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

            <!-- Live compilation toggle (document-wide) -->
            <button
                onclick={() => leanCellLiveCompile.set(!$leanCellLiveCompile)}
                aria-pressed={$leanCellLiveCompile}
                title={$t(
                    $leanCellLiveCompile
                        ? "lean_cell.live_on_hint"
                        : "lean_cell.live_off_hint",
                )}
                class="flex h-[22px] w-7 cursor-pointer items-center justify-center rounded-md border border-brand-sand-200 transition-colors dark:border-[#414559] {$leanCellLiveCompile
                    ? 'bg-brand-gold-200 text-brand-charcoal-900 dark:bg-[#414559] dark:text-[#c6d0f5]'
                    : 'text-brand-charcoal-300 hover:bg-brand-sand-100 hover:text-brand-charcoal-900 dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]'}"
            >
                <Icon
                    icon={$leanCellLiveCompile ? "lucide:zap" : "lucide:zap-off"}
                    width="0.8rem"
                />
            </button>

            <!-- Lean formatter -->
            <button
                onclick={formatLean}
                title={$t("lean_cell.format")}
                aria-label={$t("lean_cell.format_code")}
                class="flex h-[22px] w-7 cursor-pointer items-center justify-center rounded-md border border-brand-sand-200 text-brand-charcoal-300 transition-colors hover:bg-brand-sand-100 hover:text-brand-charcoal-900 dark:border-[#414559] dark:text-[#626880] dark:hover:bg-[#414559] dark:hover:text-[#c6d0f5]"
            >
                <Icon icon="icon-park-twotone:format-brush" width="0.8rem" />
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

            <!-- Run / Stop -->
            {#if running}
                <button
                    onclick={stop}
                    title={$t("lean_cell.stop_running")}
                    class="flex h-[22px] cursor-pointer items-center gap-1 rounded-md border border-red-200 px-2 font-sans text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                    <Icon icon="solar:stop-bold" width="0.7rem" />
                    {$t("julia_cell.stop")}
                </button>
            {:else}
                <!-- Compile split button — main compiles this cell, caret opens options -->
                <span class="relative flex items-center">
                    <button
                        onclick={() => run(true)}
                        title="{$t('lean_cell.compile')} (Ctrl/Cmd+Enter)"
                        class="flex h-[22px] cursor-pointer items-center gap-1 rounded-l-md border border-r-0 border-brand-sand-200 px-2 font-sans text-[10px] font-semibold text-brand-gold-600 transition-colors hover:bg-brand-gold-100 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:border-[#414559] dark:text-brand-gold-400 dark:hover:bg-[#414559]"
                    >
                        <Icon icon="solar:play-bold" width="0.7rem" />
                        {$t("lean_cell.compile")}
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
                            class="fixed z-[61] flex min-w-[8rem] -translate-x-full flex-col overflow-hidden rounded-md border border-brand-sand-200 bg-white py-0.5 shadow-md dark:border-[#414559] dark:bg-[#292c3c]"
                            style="left: {runMenuPos.x}px; top: {runMenuPos.y}px;"
                        >
                            <button
                                onclick={() => {
                                    showRunMenu = false;
                                    void run(true);
                                }}
                                class="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-left font-sans text-[10px] text-brand-charcoal-700 transition-colors hover:bg-brand-sand-100 dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                            >
                                <Icon icon="solar:play-bold" width="0.7rem" />
                                {$t("lean_cell.compile_cell")}
                            </button>
                            <button
                                onclick={runAll}
                                class="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-left font-sans text-[10px] text-brand-charcoal-700 transition-colors hover:bg-brand-sand-100 dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                            >
                                <Icon
                                    icon="solar:play-stream-bold"
                                    width="0.7rem"
                                />
                                {$t("lean_cell.compile_all")}
                            </button>
                            <div
                                class="my-0.5 h-px bg-brand-sand-200 dark:bg-[#414559]"
                            ></div>
                            <button
                                onclick={clearAllOutputs}
                                class="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-left font-sans text-[10px] text-brand-charcoal-700 transition-colors hover:bg-brand-sand-100 dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                            >
                                <Icon icon="lucide:x" width="0.7rem" />
                                {$t("lean_cell.clear_all_outputs")}
                            </button>
                            <button
                                onclick={openToolchainInfo}
                                class="flex cursor-pointer items-center gap-1.5 px-2 py-1 text-left font-sans text-[10px] text-brand-charcoal-700 transition-colors hover:bg-brand-sand-100 dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                            >
                                <Icon
                                    icon="solar:cpu-bolt-bold-duotone"
                                    width="0.7rem"
                                />
                                {$t("lean_cell.toolchain_info")}
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
        class="lean-cell-editor px-2 py-1.5 bg-brand-sand-50 dark:bg-[#232634] text-brand-charcoal-900 dark:text-[#c6d0f5]"
        class:hidden={!showCode}
        style={!showCode ? "display:none" : ""}
    ></div>

    <!-- Infoview — the elaborator's messages for this cell -->
    {#if showOutput && hasRun && (sorted.length > 0 || liveRaw)}
        <div
            class="relative flow-root border-t border-brand-sand-200 bg-brand-sand-50 px-2 py-0 dark:border-[#363a4f] dark:bg-[#1e2030]"
            class:border-t-0={!showCode}
        >
            {#if liveRaw}
                <pre
                    class="m-0 mb-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-tight text-brand-charcoal-800 dark:text-[#c6d0f5]">{liveRaw}</pre>
            {/if}
            {#each sorted as diag, i (`${diag.severity}-${diag.line}-${diag.column}-${i}`)}
                {@const style = SEVERITY_STYLE[diag.severity]}
                <div class="mb-0.5 flex items-baseline gap-1.5 last:mb-0">
                    <!-- Only warnings carry a marker here. `information` is the
                         ordinary output of a cell (`#eval` / `#check` results),
                         and an error announces itself through red message text
                         — so neither needs an icon repeating the point. -->
                    {#if diag.severity === "warning"}
                        <Icon
                            icon={style.icon}
                            width="0.7rem"
                            class="mt-[1px] shrink-0 self-start {style.text}"
                        />
                    {/if}
                    <!-- Position and message share one row, so the message —
                         including its wrapped lines — forms a column to the right
                         of the line number rather than starting underneath it.
                         The row aligns on the baseline rather than the box top:
                         box-top alignment leaves the glyphs at different heights
                         whenever the two items' box models differ at all, whereas
                         baseline alignment lines up the text itself. For a
                         multi-line message flexbox uses its *first* baseline, so
                         the label sits on the message's opening line. Its text sits
                         flush against the tags because any whitespace inside the
                         button would render as a leading space under the cell's
                         white-space: normal. -->
                    <button
                        onclick={() => jumpTo(diag)}
                        title={$t("lean_infoview.jump_to")}
                        class="shrink-0 cursor-pointer rounded font-mono text-[11px] leading-tight text-brand-charcoal-400 transition-colors hover:bg-black/5 hover:text-brand-charcoal-700 dark:text-[#838ba7] dark:hover:bg-white/10 dark:hover:text-[#c6d0f5]"
                    >{positionLabel(diag)}</button>
                    <pre
                        class="m-0 min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-tight {diag.severity ===
                        'error'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-brand-charcoal-800 dark:text-[#c6d0f5]'}">{diag.message}</pre>
                </div>
            {/each}
            {#if liveElapsed > 0}
                <!-- Pinned to the panel's top-right corner rather than placed in
                     the flow, so the timing costs no vertical space. It carries
                     the panel's own background and a little left padding so a
                     long first line passes cleanly underneath instead of
                     colliding with it. -->
                <div
                    class="pointer-events-none absolute top-0.5 right-2 bg-brand-sand-50 pl-1 font-mono text-[9.5px] leading-none text-brand-charcoal-300 dark:bg-[#1e2030] dark:text-[#626880]"
                >
                    {formatElapsed(liveElapsed)}
                </div>
            {/if}
        </div>
    {/if}

    {#if $isPro && aiSelection}
        <AiSelectionToolbar
            selectedText={aiSelection.text}
            x={aiSelection.x}
            y={aiSelection.y}
            contextPrompt={`This text is a selection from a Lean 4 code cell. Full cell source:\n\n${editCode}`}
            onReplace={replaceAiSelection}
            onClose={() => (aiSelection = null)}
        />
    {/if}
</div>

{#if showToolchainInfo}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="lean-toolchain-backdrop fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onclick={onToolchainBackdropClick}
        onkeydown={onToolchainKeydown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lean-toolchain-title"
        tabindex="-1"
    >
        <div
            class="lean-toolchain-panel font-sans flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40"
        >
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
                        id="lean-toolchain-title"
                        class="text-[11px] py-2 font-semibold uppercase tracking-wide
                               text-brand-charcoal-500 dark:text-[#838ba7]"
                    >
                        {$t("lean_cell.toolchain_info_title")}
                    </span>
                </div>

                <button
                    onclick={closeToolchainInfo}
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

            <div class="px-4 py-3 max-h-[60vh] overflow-y-auto">
                {#if toolchainLoading}
                    <div
                        class="flex items-center gap-2 text-[12px] text-brand-charcoal-600 dark:text-[#a5adcb]"
                    >
                        <Icon icon="svg-spinners:180-ring" width="0.9rem" />
                        {$t("lean_cell.probing_toolchain")}
                    </div>
                {:else if toolchainError}
                    <div
                        class="rounded-md border border-red-200/80 dark:border-red-700/40 bg-red-50/90 dark:bg-red-900/15 px-3 py-2 text-[11.5px] text-red-700 dark:text-red-200 whitespace-pre-wrap break-words"
                    >
                        {toolchainError}
                    </div>
                {:else if toolchainText}
                    <pre
                        class="m-0 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-snug text-brand-charcoal-800 dark:text-[#c6d0f5]">{toolchainText}</pre>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .lean-toolchain-backdrop {
        animation: lean-toolchain-fade 140ms ease-out;
    }
    .lean-toolchain-panel {
        animation: lean-toolchain-rise 180ms ease-out;
    }
    @keyframes lean-toolchain-fade {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
    @keyframes lean-toolchain-rise {
        from {
            opacity: 0;
            transform: translateY(6px) scale(0.98);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    /* The editor root is white-space: pre-wrap (set inline by Lexical), which
       preserves the whitespace text nodes Svelte renders between this cell's
       sibling blocks — the header, the code host, the output panel and each
       message row. Under pre-wrap those newlines are real line breaks, so every
       gap in the template became a blank line on screen. Collapsing whitespace
       here removes them at the source; the `<pre>` elements inside set their own
       white-space, so message text is unaffected. Same fix, and same cause, as
       `.editor-shell span.editor-image` in app.css. */
    .lean-cell {
        white-space: normal;
    }

    .lean-cell-editor :global(.cm-editor) {
        margin-block: 0 !important;
    }

    .lean-cell-editor[style*="display:none"] {
        display: none !important;
        margin: 0 !important;
        padding: 0 !important;
    }

    .lean-cell-selected {
        outline: 2px solid rgba(99, 130, 233, 0.45);
    }

    /* Compiling indicator — a thin moving gradient on the header's bottom
       border. Brand gold in light mode, softened pastels in dark, so it reads
       as activity rather than an error. */
    .lean-cell-runbar {
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
        animation: lean-cell-runbar 1.4s linear infinite;
    }

    :global(.dark) .lean-cell-runbar {
        background-image: linear-gradient(
            90deg,
            transparent 0%,
            #8caaee 30%,
            #e5c890 50%,
            #8caaee 70%,
            transparent 100%
        );
    }

    @keyframes lean-cell-runbar {
        0% {
            background-position: -100% 0;
        }
        100% {
            background-position: 200% 0;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .lean-cell-runbar {
            animation: none;
            background-position: 50% 0;
        }
    }
</style>
