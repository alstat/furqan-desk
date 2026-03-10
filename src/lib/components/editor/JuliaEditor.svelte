<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { listen } from "@tauri-apps/api/event";
    import { get } from "svelte/store";
    import { IS_APPLE } from "@lexical/utils";
    import { activeTab, setActiveTabContent, activeTabId } from "$lib/stores/tabs.store";
    import {
        juliaReplStarted,
        juliaReplHistory,
        type ReplLine,
    } from "$lib/stores/editor.store";
    import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
    import type { KeyBinding } from "@codemirror/view";
    import { autocompletion, type CompletionSource } from "@codemirror/autocomplete";
    import { JULIA_COMPLETIONS } from "$lib/completions/julia";

    const labelClass =
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300";

    let replOutputEl: HTMLDivElement;
    let replInputEl: HTMLTextAreaElement;
    let isRunning = $state(false);
    let focusReplOnDone = false;  // true only when execution was triggered from the REPL input

    // ── REPL console input ────────────────────────────────────────────────────
    let replInput = $state('');
    let replCmdHistory: string[] = [];   // submitted commands, newest first
    let historyIndex = $state(-1);       // -1 = new input
    let savedInput = '';                 // stash current draft when browsing history

    const replInputRows = $derived(Math.max(1, (replInput.match(/\n/g) ?? []).length + 1));

    function handleReplKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const code = replInput.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            if (!code.trim() || isRunning) return;
            replInput = '';
            historyIndex = -1;
            savedInput = '';
            replCmdHistory = [code, ...replCmdHistory];
            executeCode(code, true);

        } else if (e.key === 'ArrowUp') {
            // Only navigate history when the cursor is on the first line
            const before = replInput.slice(0, replInputEl.selectionStart);
            if (before.includes('\n')) return;
            e.preventDefault();
            if (replCmdHistory.length === 0) return;
            if (historyIndex === -1) savedInput = replInput;
            historyIndex = Math.min(historyIndex + 1, replCmdHistory.length - 1);
            replInput = replCmdHistory[historyIndex];
            requestAnimationFrame(() => {
                replInputEl.selectionStart = replInputEl.selectionEnd = replInput.length;
            });

        } else if (e.key === 'ArrowDown') {
            // Only navigate history when the cursor is on the last line
            const after = replInput.slice(replInputEl.selectionEnd);
            if (after.includes('\n')) return;
            e.preventDefault();
            if (historyIndex === -1) return;
            historyIndex--;
            replInput = historyIndex === -1 ? savedInput : replCmdHistory[historyIndex];
            requestAnimationFrame(() => {
                replInputEl.selectionStart = replInputEl.selectionEnd = replInput.length;
            });
        }
    }

    // ── Completion source ─────────────────────────────────────────────────────
    const juliaCompletionSource: CompletionSource = async (context) => {
        const word = context.matchBefore(/\w+/);
        if (!word || (word.from === word.to && !context.explicit)) return null;

        // Use REPL completions when available and not executing
        if (get(juliaReplStarted) && !isRunning) {
            try {
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

        // Static fallback
        const lower = word.text.toLowerCase();
        const filtered = JULIA_COMPLETIONS.filter(c => c.label.toLowerCase().startsWith(lower));
        if (filtered.length === 0) return null;
        return { from: word.from, options: filtered, validFor: /^\w*$/ };
    };

    const juliaCompletionExtension = autocompletion({ override: [juliaCompletionSource] });

    // ── Per-tab REPL lines ────────────────────────────────────────────────────
    let replLines = $state<ReplLine[]>([]);

    $effect(() => {
        const id = $activeTabId;
        if (!id) return;
        replLines = juliaReplHistory.get(id) ?? [];
    });

    function handleInput(newContent: string) {
        setActiveTabContent(newContent);
    }

    async function executeCode(snippet: string, fromRepl = false) {
        snippet = snippet.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        if (!snippet.trim()) return;
        const id = $activeTabId;
        if (!id) return;

        isRunning = true;
        focusReplOnDone = fromRepl;
        replLines = [...replLines, { text: snippet, kind: 'input' }];
        juliaReplHistory.set(id, replLines);
        scrollToBottom();

        if (!$juliaReplStarted) {
            await invoke("start_julia_repl");
            juliaReplStarted.set(true);
        }
        await invoke("run_julia_code", { code: snippet });
    }

    // ── Editor keymap ─────────────────────────────────────────────────────────
    // Mod-Enter: run current line or selection, then advance cursor to next line.
    const juliaKeymap: KeyBinding[] = [{
        key: 'Mod-Enter',
        run(view) {
            const { from, to } = view.state.selection.main;

            if (from !== to) {
                // Selection: execute, no cursor movement
                executeCode(view.state.sliceDoc(from, to));
            } else {
                const line = view.state.doc.lineAt(from);
                executeCode(line.text);

                // Advance to the start of the next line (or end of doc)
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

                if (is_done) {
                    isRunning = false;
                    if (focusReplOnDone) {
                        requestAnimationFrame(() => replInputEl?.focus());
                    }
                }
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
            extensions={[juliaCompletionExtension]}
            onchange={handleInput}
            class="flex-1 min-h-0 overflow-hidden border border-brand-sand-200 rounded-md mx-2 focus-within:ring-2 focus-within:ring-brand-gold-100 focus-within:border-brand-gold-400 font-mono"
        />
    </div>

    <!-- REPL panel -->
    <div class="flex-none h-64 flex flex-col p-2">
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
                role="log"
                aria-label="REPL output"
            >
                {#if replLines.length === 0}
                    <p class="text-brand-charcoal-300 italic select-none">
                        Press {IS_APPLE ? "⌘Enter" : "Ctrl+Enter"} in the editor, or type below and press Enter.
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

            <!-- REPL console input -->
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div
                class="flex items-start gap-2 px-3 py-1.5 bg-brand-sand-50 border-t border-brand-sand-400 shrink-0"
                onclick={() => replInputEl?.focus()}
            >
                <span class="text-brand-gold-600 shrink-0 select-none font-semibold font-mono text-[11px] leading-relaxed pt-px">
                    julia&gt;
                </span>
                <textarea
                    bind:this={replInputEl}
                    bind:value={replInput}
                    disabled={isRunning}
                    onkeydown={handleReplKeydown}
                    rows={replInputRows}
                    placeholder={isRunning ? 'Running…' : 'Enter code, Shift+Enter for newline'}
                    class="flex-1 resize-none bg-transparent font-mono text-[11px] text-brand-charcoal-700
                           leading-relaxed outline-none placeholder-brand-charcoal-300
                           disabled:opacity-40 disabled:cursor-not-allowed"
                ></textarea>
            </div>

        </div>
    </div>

</div>
