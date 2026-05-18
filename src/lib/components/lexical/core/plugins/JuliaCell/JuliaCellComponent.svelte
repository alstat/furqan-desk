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
        type JuliaCellPlot,
    } from "$lib/stores/julia-notebook";
    import {
        juliaSupport,
        juliaLightHighlight,
        juliaDarkHighlight,
    } from "$lib/codemirror/julia";
    import { createNodeSelectionStore } from "../../nodeSelectionStore.js";
    import { appDarkMode } from "$lib/stores/editor.store";
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

    let hasRun = $derived(runCount > 0 || output !== "" || plots.length > 0);
    let showCode = $derived(mode !== "output");
    let showOutput = $derived(mode !== "code");

    let editorHost: HTMLDivElement | null = $state(null);
    let view: EditorView | null = null;
    const highlightComp = new Compartment();

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
        "&": { backgroundColor: "transparent", fontSize: "12px", margin: "0" },
        "&.cm-focused": { outline: "none" },
        ".cm-scroller": {
            fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            lineHeight: "1.35",
        },
        ".cm-content": { margin: "0", padding: "0" },
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
                keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
                juliaSupport,
                highlightComp.of(highlightExt($appDarkMode)),
                EditorView.lineWrapping,
                cellTheme,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        editCode = update.state.doc.toString();
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
    class="julia-cell my-0.5 overflow-hidden rounded-md border border-brand-sand-200 dark:border-[#363a4f]"
    class:julia-cell-selected={$isSelected}
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

        <span class="flex items-center gap-1">
            <!-- Display-mode toggle -->
            <span
                class="flex items-center rounded border border-brand-sand-200 dark:border-[#414559] overflow-hidden"
            >
                {#each MODES as m (m.id)}
                    <button
                        onclick={() => setMode(m.id)}
                        title={$t(`julia_cell.mode_${m.id}`)}
                        aria-pressed={mode === m.id}
                        class="flex items-center px-1.5 py-0 transition-colors {mode ===
                        m.id
                            ? 'bg-brand-gold-200 dark:bg-[#414559] text-brand-charcoal-900 dark:text-[#c6d0f5]'
                            : 'text-brand-charcoal-300 dark:text-[#626880] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]'}"
                    >
                        <Icon icon={m.icon} width="0.75rem" />
                    </button>
                {/each}
            </span>

            <!-- Run -->
            <button
                onclick={run}
                disabled={running}
                title="{$t('julia_cell.run')} (Ctrl/Cmd+Enter)"
                class="cursor-pointer flex items-center gap-1 rounded px-1.5 py-0 text-[11px] font-medium font-sans text-brand-charcoal-400 dark:text-[#a5adce] hover:text-brand-gold-600 dark:hover:text-brand-gold-400 transition-colors disabled:opacity-50 disabled:cursor-default"
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
        class="julia-cell-editor px-2 py-1.5 -my-5.5 bg-brand-sand-50 dark:bg-[#232634] text-brand-charcoal-900 dark:text-[#c6d0f5]"
        class:hidden={!showCode}
    ></div>

    <!-- Output -->
    {#if showOutput && hasRun}
        <div
            class="border-t border-brand-sand-200 dark:border-[#363a4f] -mb-5.5 bg-white/60 dark:bg-[#1e2030] px-2"
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
                <span
                    class="font-mono text-[11px] leading-tight italic text-brand-charcoal-300 dark:text-[#626880]"
                    >{$t("julia_cell.no_output")}</span
                >
            {/if}
        </div>
    {/if}
</div>

<style>
    .julia-cell-editor :global(.cm-editor) {
        margin-block: 0 !important;
    }

    .julia-cell-selected {
        outline: 2px solid rgba(99, 130, 233, 0.45);
    }
</style>
