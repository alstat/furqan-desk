<script lang="ts">
    import { get } from "svelte/store";
    import { onDestroy } from "svelte";
    import { IS_APPLE } from "@lexical/utils";
    import {
        activeTab,
        setActiveTabContent,
        setTabContent,
        tabs,
    } from "$lib/stores/tabs.store";
    import { juliaReplStarted } from "$lib/stores/editor.store";
    import {
        juliaIsRunning,
        executeJuliaCode,
        flashingTabId,
    } from "$lib/stores/julia-terminal.store";
    import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
    import JuliaReplPane from "./JuliaReplPane.svelte";
    import type { KeyBinding } from "@codemirror/view";
    import {
        autocompletion,
        type CompletionSource,
    } from "@codemirror/autocomplete";
    import { JULIA_COMPLETIONS } from "$lib/completions/julia";

    /**
     * tabId  — when set, this editor shows a specific (secondary/split) tab
     *          instead of the currently active tab.
     * hideRepl — when true, the bottom REPL/terminal panel is hidden
     *            (used when the panel is displayed on the right-hand side instead).
     */
    let {
        tabId = null,
        hideRepl = false,
    }: { tabId?: string | null; hideRepl?: boolean } = $props();

    const labelClass =
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300";

    // ── Effective tab (primary uses $activeTab; secondary uses tabId prop) ─────

    let effectiveTab = $derived(
        tabId ? ($tabs.find((t) => t.id === tabId) ?? null) : $activeTab,
    );

    // ── Completion source ─────────────────────────────────────────────────────

    let isRunning = $derived($juliaIsRunning);
    let isFlashing = $derived($flashingTabId === effectiveTab?.id);

    const juliaCompletionSource: CompletionSource = async (context) => {
        const word = context.matchBefore(/\w+/);
        if (!word || (word.from === word.to && !context.explicit)) return null;

        if (get(juliaReplStarted) && !get(juliaIsRunning)) {
            try {
                const { invoke } = await import("@tauri-apps/api/core");
                const replCompletions = await invoke<string[]>(
                    "julia_complete",
                    { prefix: word.text },
                );
                if (replCompletions.length > 0) {
                    return {
                        from: word.from,
                        options: replCompletions.map((label) => ({
                            label,
                            type: "function",
                        })),
                        validFor: /^\w*$/,
                    };
                }
            } catch {
                // fall through to static completions
            }
        }

        const lower = word.text.toLowerCase();
        const filtered = JULIA_COMPLETIONS.filter((c) =>
            c.label.toLowerCase().startsWith(lower),
        );
        if (filtered.length === 0) return null;
        return { from: word.from, options: filtered, validFor: /^\w*$/ };
    };

    const juliaCompletionExtension = autocompletion({
        override: [juliaCompletionSource],
    });

    // ── Content change handler ────────────────────────────────────────────────

    function handleInput(newContent: string) {
        if (tabId) {
            setTabContent(tabId, newContent);
        } else {
            setActiveTabContent(newContent);
        }
    }

    // ── Execute code (called from keymap) ─────────────────────────────────────

    async function executeCode(snippet: string) {
        await executeJuliaCode(snippet);
    }

    // ── Editor keymap ─────────────────────────────────────────────────────────

    // ── Draggable REPL splitter ───────────────────────────────────────────────

    let replHeight = $state(256);
    let dragStartY = 0;
    let dragStartHeight = 0;

    function startDrag(e: PointerEvent) {
        dragStartY = e.clientY;
        dragStartHeight = replHeight;
        window.addEventListener('pointermove', onDrag);
        window.addEventListener('pointerup', stopDrag, { once: true });
    }
    function onDrag(e: PointerEvent) {
        const delta = dragStartY - e.clientY;
        replHeight = Math.max(120, dragStartHeight + delta);
    }
    function stopDrag() {
        window.removeEventListener('pointermove', onDrag);
    }

    onDestroy(() => { window.removeEventListener('pointermove', onDrag); });

    const juliaKeymap: KeyBinding[] = [
        {
            key: "Mod-Enter",
            run(view) {
                const { from, to } = view.state.selection.main;
                if (from !== to) {
                    executeCode(view.state.sliceDoc(from, to));
                } else {
                    const line = view.state.doc.lineAt(from);
                    executeCode(line.text);
                    if (line.number < view.state.doc.lines) {
                        const nextLine = view.state.doc.line(line.number + 1);
                        view.dispatch({
                            selection: { anchor: nextLine.from },
                            scrollIntoView: true,
                        });
                    }
                }
                return true;
            },
        },
    ];
</script>

<div class="relative overflow-visible flex flex-col h-full">
    <!-- Editor area -->
    <div class="flex-1 flex flex-col min-h-0" style="min-height: 120px">
        <span class="{labelClass} px-2 pt-1"
            >{effectiveTab?.name ?? "Julia Editor"}</span
        >
        {#if effectiveTab}
            <div
                class="flex-1 min-h-0 rounded-md mx-2 border border-brand-sand-200 overflow-hidden focus-within:ring-2 focus-within:ring-brand-gold-100 focus-within:border-brand-gold-400 {isFlashing
                    ? 'flash-border-anim'
                    : ''} {hideRepl ? 'mb-3' : ''}"
            >
                <CodeMirrorEditor
                    value={effectiveTab.content}
                    language="julia"
                    extraKeymap={juliaKeymap}
                    extensions={[juliaCompletionExtension]}
                    onchange={handleInput}
                    class="h-full font-mono"
                />
            </div>
        {/if}
    </div>

    <!-- Embedded REPL / Terminal panel (hidden when panel is on the right side) -->
    {#if !hideRepl}
        <!-- Draggable splitter -->
        <div
            class="flex-none h-1.5 cursor-row-resize flex items-center justify-center group
                   hover:bg-brand-gold-100 dark:hover:bg-brand-gold-100/10 transition-colors select-none"
            onpointerdown={startDrag}
            role="separator"
            aria-orientation="horizontal"
        >
            <div class="w-8 h-0.5 rounded-full bg-brand-sand-400 dark:bg-[#414559]
                        group-hover:bg-brand-gold-400 transition-colors"></div>
        </div>
        <div class="flex-none flex flex-col p-2" style:height="{replHeight}px">
            <JuliaReplPane />
        </div>
    {/if}
</div>
