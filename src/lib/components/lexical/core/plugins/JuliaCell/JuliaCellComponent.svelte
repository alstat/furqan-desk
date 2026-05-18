<script lang="ts">
    import { onMount, tick } from "svelte";
    import Icon from "@iconify/svelte";
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
    import { $getNodeByKey as getNodeByKey } from "lexical";
    import {
        $isJuliaCellNode as isJuliaCellNode,
        type JuliaCellDisplayMode,
    } from "./JuliaCellNode";
    import {
        runJuliaCell,
        juliaCellFontSize,
        juliaCellLineHeight,
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

    let hasRun = $derived(runCount > 0 || output !== "" || plots.length > 0);
    let showCode = $derived(mode !== "output");
    let showOutput = $derived(mode !== "code");

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
            persistCode();
            view?.destroy();
            view = null;
        };
    });
</script>

<div
    class="julia-cell my-0.5 flex flex-col overflow-hidden rounded-md border border-brand-sand-200 dark:border-[#363a4f]"
    class:julia-cell-selected={$isSelected}
    style="--julia-cell-code-font-size: {$juliaCellFontSize}px; --julia-cell-code-line-height: {$juliaCellLineHeight}; --julia-cell-caret: {caretColor}"
>
    <!-- Header — kept low-contrast so the block recedes behind the code -->
    <div
        class="flex items-center justify-between border-b border-brand-sand-200 dark:border-[#363a4f] px-2 py-0.5"
    >
        <span class="flex items-center gap-1.5 select-none">
            <Icon
                icon="tabler:brand-julia"
                class="text-brand-charcoal-300 dark:text-[#626880]"
                width="0.8rem"
            />
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

            <!-- Run -->
            <button
                onclick={run}
                disabled={running}
                title="{$t('julia_cell.run')} (Ctrl/Cmd+Enter)"
                class="flex h-[22px] cursor-pointer items-center gap-1 rounded-md border border-brand-sand-200 px-2 font-sans text-[10px] font-semibold text-brand-gold-600 transition-colors hover:bg-brand-gold-100 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:border-[#414559] dark:text-brand-gold-400 dark:hover:bg-[#414559]"
            >
                {#if running}
                    <Icon icon="svg-spinners:90-ring-with-bg" width="0.7rem" />
                    {$t("julia_cell.running")}
                {:else}
                    <Icon icon="solar:play-bold" width="0.7rem" />
                    {$t("julia_cell.run")}
                {/if}
            </button>
        </span>
    </div>

    <!-- Code input — host stays mounted (hidden) so the editor survives toggles -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        bind:this={editorHost}
        dir="ltr"
        onkeydown={(e) => e.stopPropagation()}
        class="julia-cell-editor px-2 py-1.5 bg-brand-sand-50 dark:bg-[#232634] text-brand-charcoal-900 dark:text-[#c6d0f5]"
        class:hidden={!showCode}
        style={!showCode ? "display:none" : ""}
    ></div>

    <!-- Output -->
    {#if showOutput && hasRun}
        <div
            class="flow-root border-t border-brand-sand-200 dark:border-[#363a4f] py-1 -mb-5.5 bg-brand-sand-50 dark:bg-[#1e2030] px-2"
            class:border-t-0={!showCode}
        >
            {#if liveOutput}
                <pre
                    class="m-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-tight {liveError
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-brand-charcoal-900 dark:text-[#c6d0f5]'}">{liveOutput}</pre>
            {/if}
            {#each livePlots as plot (plot.data)}
                {#if plot.format === "svg"}
                    <div class="mt-0.5 max-w-full overflow-auto">
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                        {@html atob(plot.data)}
                    </div>
                {:else}
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
</div>

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
</style>
