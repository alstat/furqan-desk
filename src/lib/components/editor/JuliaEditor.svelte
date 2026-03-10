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
    let focusReplOnDone = false;

    // ── REPL console input ────────────────────────────────────────────────────
    let replInput = $state('');
    let replCmdHistory: string[] = [];
    let historyIndex = $state(-1);
    let savedInput = '';

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
        scrollReplToBottom();

        if (!$juliaReplStarted) {
            await invoke("start_julia_repl");
            juliaReplStarted.set(true);
        }
        await invoke("run_julia_code", { code: snippet });
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

    function scrollReplToBottom() {
        if (replOutputEl) {
            setTimeout(() => { replOutputEl.scrollTop = replOutputEl.scrollHeight; }, 0);
        }
    }

    function clearRepl() {
        const id = $activeTabId;
        replLines = [];
        if (id) juliaReplHistory.set(id, []);
    }

    // ── Terminal tabs ─────────────────────────────────────────────────────────
    type TermTab = { id: string; label: string };
    type TermLine = { text: string; is_stderr: boolean; is_input: boolean };

    let activePanel = $state<'julia' | string>('julia');
    let termTabs    = $state<TermTab[]>([]);
    let termCounter = 0;

    let termOutputLines  = $state<Record<string, TermLine[]>>({});
    let termIsRunning    = $state<Record<string, boolean>>({});
    let termInputValues  = $state<Record<string, string>>({});
    let termExited       = $state<Record<string, boolean>>({});

    let termOutputEl: HTMLDivElement | undefined = $state(undefined);
    let termInputEl:  HTMLInputElement | undefined = $state(undefined);

    // scroll terminal to bottom when active panel switches or new output arrives
    $effect(() => {
        void activePanel;
        if (termOutputEl) {
            setTimeout(() => { termOutputEl!.scrollTop = termOutputEl!.scrollHeight; }, 0);
        }
    });

    async function addTerminal() {
        termCounter++;
        const id    = `term-${termCounter}`;
        const label = `Terminal ${termCounter}`;
        termTabs             = [...termTabs, { id, label }];
        termOutputLines[id]  = [];
        termIsRunning[id]    = false;
        termInputValues[id]  = '';
        termExited[id]       = false;
        activePanel          = id;
        try {
            await invoke('start_terminal', { id });
        } catch (e) {
            termOutputLines[id].push({ text: String(e), is_stderr: true, is_input: false });
            termExited[id] = true;
        }
    }

    async function closeTerminal(id: string) {
        try { await invoke('close_terminal', { id }); } catch { /* ignore */ }
        termTabs = termTabs.filter(t => t.id !== id);
        delete termOutputLines[id];
        delete termIsRunning[id];
        delete termInputValues[id];
        delete termExited[id];
        if (activePanel === id) activePanel = 'julia';
    }

    async function runTerminalCommand(id: string) {
        const cmd = (termInputValues[id] ?? '').trim();
        if (!cmd || termIsRunning[id] || termExited[id]) return;
        termInputValues[id] = '';
        termIsRunning[id]   = true;
        termOutputLines[id].push({ text: cmd, is_stderr: false, is_input: true });
        scrollTermToBottom();
        try {
            await invoke('send_terminal_input', { id, command: cmd });
        } catch (e) {
            termOutputLines[id].push({ text: String(e), is_stderr: true, is_input: false });
            termIsRunning[id] = false;
            scrollTermToBottom();
        }
    }

    function scrollTermToBottom() {
        if (termOutputEl) {
            setTimeout(() => { termOutputEl!.scrollTop = termOutputEl!.scrollHeight; }, 0);
        }
    }

    // ── Event listeners ───────────────────────────────────────────────────────
    onMount(() => {
        const unlistenJulia = listen<{ chunk: string; is_done: boolean; error: string | null }>(
            "julia-output",
            (event) => {
                const id = $activeTabId;
                if (!id) return;
                const { chunk, is_done, error } = event.payload;
                if (chunk) {
                    replLines = [...replLines, { text: chunk, kind: error ? 'error' : 'output' }];
                    juliaReplHistory.set(id, replLines);
                }
                if (is_done) {
                    isRunning = false;
                    if (focusReplOnDone) requestAnimationFrame(() => replInputEl?.focus());
                }
                scrollReplToBottom();
            },
        );

        const unlistenTermOut = listen<{ id: string; line: string; is_stderr: boolean }>(
            "terminal-output",
            (event) => {
                const { id, line, is_stderr } = event.payload;
                if (!termOutputLines[id]) return;
                termOutputLines[id].push({ text: line, is_stderr, is_input: false });
                if (activePanel === id) scrollTermToBottom();
            },
        );

        const unlistenTermDone = listen<{ id: string }>(
            "terminal-done",
            (event) => {
                const { id } = event.payload;
                termIsRunning[id] = false;
                if (activePanel === id) scrollTermToBottom();
            },
        );

        const unlistenTermExit = listen<{ id: string }>(
            "terminal-exit",
            (event) => {
                const { id } = event.payload;
                if (id in termExited) {
                    termExited[id]    = true;
                    termIsRunning[id] = false;
                }
            },
        );

        return () => {
            unlistenJulia.then(fn => fn());
            unlistenTermOut.then(fn => fn());
            unlistenTermDone.then(fn => fn());
            unlistenTermExit.then(fn => fn());
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

    <!-- REPL / Terminal panel -->
    <div class="flex-none h-64 flex flex-col p-2">
        <div class="flex-1 flex flex-col rounded-md overflow-hidden border border-brand-sand-400 dark:border-[#414559] shadow-sm min-h-0">

            <!-- Tab bar -->
            <div class="flex items-center bg-brand-sand-200 dark:bg-[#292c3c] border-b border-brand-sand-400 dark:border-[#414559] shrink-0 overflow-x-auto">

                <!-- Julia REPL tab -->
                <div class="flex items-center flex-none border-r border-brand-sand-400 dark:border-[#414559]
                            {activePanel === 'julia'
                                ? 'bg-brand-sand-50 dark:bg-[#414559]'
                                : 'hover:bg-brand-sand-100 dark:hover:bg-[#303446]'}">
                    <button
                        onclick={() => activePanel = 'julia'}
                        class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors select-none cursor-pointer
                               {activePanel === 'julia'
                                   ? 'text-brand-charcoal-700 dark:text-[#c6d0f5]'
                                   : 'text-brand-charcoal-300 dark:text-[#838ba7]'}"
                    >Julia REPL</button>
                    {#if activePanel === 'julia'}
                        {#if isRunning}
                            <span class="text-[10px] italic text-brand-gold-400 pr-2 select-none">Running…</span>
                        {/if}
                        <button
                            onclick={(e) => { e.stopPropagation(); clearRepl(); }}
                            class="cursor-pointer pr-2 text-[10px] font-medium text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-charcoal-600 dark:hover:text-[#c6d0f5] transition-colors select-none"
                            title="Clear REPL output"
                        >Clear</button>
                    {/if}
                </div>

                <!-- Terminal tabs -->
                {#each termTabs as tab (tab.id)}
                    <div class="flex items-center flex-none border-r border-brand-sand-400 dark:border-[#414559]
                                {activePanel === tab.id
                                    ? 'bg-brand-sand-50 dark:bg-[#414559]'
                                    : 'hover:bg-brand-sand-100 dark:hover:bg-[#303446]'}">
                        <button
                            onclick={() => activePanel = tab.id}
                            class="cursor-pointer px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors select-none
                                   {activePanel === tab.id
                                       ? 'text-brand-charcoal-700 dark:text-[#c6d0f5]'
                                       : 'text-brand-charcoal-300 dark:text-[#838ba7]'}"
                        >{tab.label}</button>
                        <button
                            onclick={(e) => { e.stopPropagation(); closeTerminal(tab.id); }}
                            class="cursor-pointer pr-2 py-1.5 text-[12px] leading-none text-brand-charcoal-300 dark:text-[#838ba7] hover:text-red-400 transition-colors"
                            title="Close terminal"
                        >×</button>
                    </div>
                {/each}

                <!-- Add terminal button -->
                <button
                    onclick={addTerminal}
                    class="cursor-pointer ml-auto px-3 py-1.5 text-sm font-medium text-brand-charcoal-400 dark:text-[#838ba7] hover:text-brand-charcoal-700 dark:hover:text-[#c6d0f5] hover:bg-brand-sand-100 dark:hover:bg-[#303446] shrink-0 transition-colors"
                    title="Add terminal"
                >+</button>
            </div>

            <!-- Julia REPL content -->
            {#if activePanel === 'julia'}
                <div class="flex-1 flex flex-col overflow-hidden min-h-0">
                    <!-- Output -->
                    <div
                        bind:this={replOutputEl}
                        class="flex-1 overflow-y-auto min-h-0 bg-brand-sand-50 dark:bg-[#232634] px-3 py-2 font-mono text-[11px] leading-relaxed"
                        role="log"
                        aria-label="REPL output"
                    >
                        {#if replLines.length === 0}
                            <p class="text-brand-charcoal-300 dark:text-[#626880] italic select-none">
                                Press {IS_APPLE ? "⌘Enter" : "Ctrl+Enter"} in the editor, or type below and press Enter.
                            </p>
                        {:else}
                            {#each replLines as line}
                                {#if line.kind === 'input'}
                                    <div class="flex gap-1.5 mt-1 first:mt-0">
                                        <span class="text-brand-gold-600 shrink-0 select-none font-semibold">julia&gt;</span>
                                        <span class="text-brand-charcoal-500 dark:text-[#c6d0f5] whitespace-pre-wrap">{line.text}</span>
                                    </div>
                                {:else if line.kind === 'error'}
                                    <div class="pl-[3.2rem] text-red-400 whitespace-pre-wrap">{line.text}</div>
                                {:else}
                                    <div class="pl-[3.2rem] text-brand-gold-600 whitespace-pre-wrap">{line.text}</div>
                                {/if}
                            {/each}
                        {/if}
                    </div>

                    <!-- Input -->
                    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                    <div
                        class="flex items-start gap-2 px-3 py-1.5 bg-brand-sand-50 dark:bg-[#232634] border-t border-brand-sand-400 dark:border-[#414559] shrink-0"
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
                            class="flex-1 resize-none bg-transparent font-mono text-[11px] text-brand-charcoal-700 dark:text-[#c6d0f5]
                                   leading-relaxed outline-none placeholder-brand-charcoal-300 dark:placeholder-[#626880]
                                   disabled:opacity-40 disabled:cursor-not-allowed"
                        ></textarea>
                    </div>
                </div>
            {/if}

            <!-- Terminal panels -->
            {#each termTabs as tab (tab.id)}
                {#if activePanel === tab.id}
                    <div class="flex-1 flex flex-col overflow-hidden min-h-0">
                        <!-- Output -->
                        <div
                            bind:this={termOutputEl}
                            class="flex-1 overflow-y-auto min-h-0 bg-brand-sand-50 dark:bg-[#232634] px-3 py-2 font-mono text-[11px] leading-relaxed"
                            role="log"
                            aria-label="Terminal output"
                        >
                            {#if (termOutputLines[tab.id] ?? []).length === 0 && !termExited[tab.id]}
                                <p class="text-brand-charcoal-300 dark:text-[#626880] italic select-none">
                                    Terminal ready. Type a command below and press Enter.
                                </p>
                            {:else}
                                {#each termOutputLines[tab.id] ?? [] as line}
                                    {#if line.is_input}
                                        <div class="flex gap-1.5 mt-1 first:mt-0">
                                            <span class="text-brand-gold-600 shrink-0 select-none font-semibold">$</span>
                                            <span class="text-brand-charcoal-500 dark:text-[#c6d0f5] whitespace-pre-wrap">{line.text}</span>
                                        </div>
                                    {:else if line.is_stderr}
                                        <div class="text-red-400 whitespace-pre-wrap">{line.text}</div>
                                    {:else}
                                        <div class="text-brand-charcoal-500 dark:text-[#c6d0f5] whitespace-pre-wrap">{line.text}</div>
                                    {/if}
                                {/each}
                                {#if termExited[tab.id]}
                                    <div class="mt-2 text-brand-charcoal-300 dark:text-[#626880] italic select-none">Process exited.</div>
                                {/if}
                            {/if}
                        </div>

                        <!-- Input -->
                        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                        <div
                            class="flex items-center gap-2 px-3 py-1.5 bg-brand-sand-50 dark:bg-[#232634] border-t border-brand-sand-400 dark:border-[#414559] shrink-0"
                            onclick={() => termInputEl?.focus()}
                        >
                            <span class="text-brand-gold-600 shrink-0 select-none font-semibold font-mono text-[11px]">$</span>
                            <input
                                bind:this={termInputEl}
                                bind:value={termInputValues[tab.id]}
                                disabled={termIsRunning[tab.id] || termExited[tab.id]}
                                onkeydown={(e) => e.key === 'Enter' && runTerminalCommand(tab.id)}
                                placeholder={termExited[tab.id] ? 'Process exited' : (termIsRunning[tab.id] ? 'Running…' : 'Enter command, press Enter to run')}
                                class="flex-1 bg-transparent font-mono text-[11px] text-brand-charcoal-700 dark:text-[#c6d0f5]
                                       outline-none placeholder-brand-charcoal-300 dark:placeholder-[#626880]
                                       disabled:opacity-40 disabled:cursor-not-allowed"
                            />
                        </div>
                    </div>
                {/if}
            {/each}

        </div>
    </div>
</div>
