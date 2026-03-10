<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { listen } from "@tauri-apps/api/event";
    import { IS_APPLE } from "@lexical/utils";
    import { activeTab, setActiveTabContent, activeTabId } from "$lib/stores/tabs.store";
    import {
        juliaReplStarted,
        juliaReplHistory,
        type ReplLine,
    } from "$lib/stores/editor.store";
    import JuliaActionBar from "./JuliaActionBar.svelte";
    import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
    import type { KeyBinding } from "@codemirror/view";

    const labelClass =
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300";

    let replOutputEl: HTMLDivElement;
    let isRunning = $state(false);

    // Per-tab REPL lines — restored from juliaReplHistory on mount/tab-switch
    let replLines = $state<ReplLine[]>([]);

    // Keep history in sync when tab switches
    $effect(() => {
        const id = $activeTabId;
        if (!id) return;
        replLines = juliaReplHistory.get(id) ?? [];
    });

    function handleInput(newContent: string) {
        setActiveTabContent(newContent);
    }

    async function executeCode(snippet: string) {
        // Normalize line endings — Windows textarea may produce \r\n
        snippet = snippet.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        if (!snippet.trim()) return;
        const id = $activeTabId;
        if (!id) return;

        isRunning = true;
        replLines = [...replLines, { text: snippet, kind: 'input' }];
        juliaReplHistory.set(id, replLines);
        scrollToBottom();

        if (!$juliaReplStarted) {
            await invoke("start_julia_repl");
            juliaReplStarted.set(true);
        }
        await invoke("run_julia_code", { code: snippet });
    }

    // CodeMirror keymap for Mod-Enter (Ctrl+Enter / ⌘+Enter)
    const juliaKeymap: KeyBinding[] = [{
        key: 'Mod-Enter',
        run(view) {
            const { from, to } = view.state.selection.main;
            let snippet: string;
            if (from !== to) {
                snippet = view.state.sliceDoc(from, to);
            } else {
                const line = view.state.doc.lineAt(from);
                snippet = line.text;
            }
            executeCode(snippet);
            return true;
        },
    }];

    function scrollToBottom() {
        if (replOutputEl) {
            setTimeout(() => {
                replOutputEl.scrollTop = replOutputEl.scrollHeight;
            }, 0);
        }
    }

    function clearRepl() {
        const id = $activeTabId;
        replLines = [];
        if (id) juliaReplHistory.set(id, []);
    }

    onMount(() => {
        const unlisten = listen<{ chunk: string; is_done: boolean; error: string | null }>(
            "julia-output",
            (event) => {
                const id = $activeTabId;
                if (!id) return;
                const { chunk, is_done, error } = event.payload;

                if (chunk) {
                    replLines = [...replLines, {
                        text: chunk,
                        kind: error ? 'error' : 'output',
                    }];
                    juliaReplHistory.set(id, replLines);
                }

                if (is_done) isRunning = false;
                scrollToBottom();
            },
        );

        return () => {
            unlisten.then((fn) => fn());
        };
    });
</script>

<div class="relative overflow-visible flex flex-col h-full">
    <!-- Editor -->
    <div class="flex-1 flex flex-col min-h-0">
        <span class="{labelClass} px-2 pt-1">Julia Editor</span>
        <CodeMirrorEditor
            value={$activeTab!.content}
            language="julia"
            extraKeymap={juliaKeymap}
            onchange={handleInput}
            class="flex-1 min-h-0 overflow-hidden border border-brand-sand-200 rounded-md mx-2 focus-within:ring-2 focus-within:ring-brand-gold-100 focus-within:border-brand-gold-400 font-mono"
        />
    </div>

    <!-- REPL panel -->
    <div class="flex-none h-52 flex flex-col p-2">
        <div class="flex-1 flex flex-col rounded-md overflow-hidden border border-brand-sand-400 shadow-sm">

            <!-- REPL header bar -->
            <div class="flex items-center justify-between px-3 py-1 bg-brand-sand-200 border-b border-brand-sand-400 shrink-0">
                <span class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300 select-none">
                    Julia REPL
                </span>
                <div class="flex items-center gap-2">
                    {#if isRunning}
                        <span class="text-[10px] italic text-brand-gold-400">Running…</span>
                    {/if}
                    <button
                        onclick={clearRepl}
                        class="cursor-pointer px-2 py-0.5 rounded text-[10px] font-medium
                               bg-brand-sand-100 hover:bg-brand-sand-200 border border-brand-sand-400
                               text-brand-charcoal-300 transition-colors"
                        title="Clear REPL output"
                    >Clear</button>
                </div>
            </div>

            <!-- Output area -->
            <div
                bind:this={replOutputEl}
                class="flex-1 overflow-y-auto min-h-0 bg-brand-sand-50 px-3 py-2 font-mono text-[11px] leading-relaxed"
            >
                {#if replLines.length === 0}
                    <p class="text-brand-charcoal-300 italic select-none">
                        Press {IS_APPLE ? "⌘Enter" : "Ctrl+Enter"} to run the current line or selection.
                    </p>
                {:else}
                    {#each replLines as line}
                        {#if line.kind === 'input'}
                            <div class="flex gap-1.5 mt-1 first:mt-0">
                                <span class="text-brand-gold-600 shrink-0 select-none font-semibold">julia&gt;</span>
                                <span class="text-brand-charcoal-500 whitespace-pre-wrap">{line.text}</span>
                            </div>
                        {:else if line.kind === 'error'}
                            <div class="pl-[3.2rem] text-red-400 whitespace-pre-wrap">{line.text}</div>
                        {:else}
                            <div class="pl-[3.2rem] text-brand-gold-600 whitespace-pre-wrap">{line.text}</div>
                        {/if}
                    {/each}
                {/if}
            </div>

        </div>
    </div>

    <JuliaActionBar />
</div>
