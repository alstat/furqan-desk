<script lang="ts">
    import { get } from "svelte/store";
    import { IS_APPLE } from "@lexical/utils";
    import { activeTab, activeTabId, setActiveTabContent, setTabContent, tabs } from "$lib/stores/tabs.store";
    import { juliaReplStarted } from "$lib/stores/editor.store";
    import {
        juliaIsRunning, runningJuliaTabId, executeJuliaCode,
    } from "$lib/stores/julia-terminal.store";
    import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
    import JuliaReplPane from "./JuliaReplPane.svelte";
    import type { KeyBinding } from "@codemirror/view";
    import { autocompletion, type CompletionSource } from "@codemirror/autocomplete";
    import { JULIA_COMPLETIONS } from "$lib/completions/julia";

    /**
     * tabId  — when set, this editor shows a specific (secondary/split) tab
     *          instead of the currently active tab.
     * hideRepl — when true, the bottom REPL/terminal panel is hidden
     *            (used when the panel is displayed on the right-hand side instead).
     */
    let {
        tabId    = null,
        hideRepl = false,
    }: { tabId?: string | null; hideRepl?: boolean } = $props();

    const labelClass =
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300";

    // ── Effective tab (primary uses $activeTab; secondary uses tabId prop) ─────

    let effectiveTab = $derived(
        tabId
            ? ($tabs.find(t => t.id === tabId) ?? null)
            : $activeTab
    );

    let effectiveTabId = $derived(tabId ?? $activeTabId ?? '');

    // ── Completion source ─────────────────────────────────────────────────────

    let isRunning = $derived($juliaIsRunning && $runningJuliaTabId === effectiveTabId);

    const juliaCompletionSource: CompletionSource = async (context) => {
        const word = context.matchBefore(/\w+/);
        if (!word || (word.from === word.to && !context.explicit)) return null;

        if (get(juliaReplStarted) && !get(juliaIsRunning)) {
            try {
                const { invoke } = await import("@tauri-apps/api/core");
                const replCompletions = await invoke<string[]>('julia_complete', { prefix: word.text });
                if (replCompletions.length > 0) {
                    return {
                        from: word.from,
                        options: replCompletions.map(label => ({ label, type: 'function' })),
                        validFor: /^\w*$/,
                    };
                }
            } catch {
                // fall through to static completions
            }
        }

        const lower = word.text.toLowerCase();
        const filtered = JULIA_COMPLETIONS.filter(c => c.label.toLowerCase().startsWith(lower));
        if (filtered.length === 0) return null;
        return { from: word.from, options: filtered, validFor: /^\w*$/ };
    };

    const juliaCompletionExtension = autocompletion({ override: [juliaCompletionSource] });

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
        if (!effectiveTabId) return;
        await executeJuliaCode(effectiveTabId, snippet);
    }

    // ── Editor keymap ─────────────────────────────────────────────────────────

    const juliaKeymap: KeyBinding[] = [{
        key: 'Mod-Enter',
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
    }];
</script>

<div class="relative overflow-visible flex flex-col h-full">
    <!-- Editor area -->
    <div class="flex-1 flex flex-col min-h-0">
        <span class="{labelClass} px-2 pt-1">Julia Editor</span>
        {#if effectiveTab}
            <CodeMirrorEditor
                value={effectiveTab.content}
                language="julia"
                extraKeymap={juliaKeymap}
                extensions={[juliaCompletionExtension]}
                onchange={handleInput}
                class="flex-1 min-h-0 overflow-hidden border border-brand-sand-200 rounded-md mx-2 focus-within:ring-2 focus-within:ring-brand-gold-100 focus-within:border-brand-gold-400 font-mono"
            />
        {/if}
    </div>

    <!-- Embedded REPL / Terminal panel (hidden when panel is on the right side) -->
    {#if !hideRepl}
        <div class="flex-none h-64 flex flex-col p-2">
            <JuliaReplPane tabId={effectiveTabId} />
        </div>
    {/if}
</div>
