<script lang="ts">
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import { invoke } from "@tauri-apps/api/core";
    import { listen } from "@tauri-apps/api/event";
    import { IS_APPLE } from "@lexical/utils";
    import {
        sharedTermState, juliaIsRunning,
        executeJuliaCode,
        type TermLine, type TermTab,
    } from "$lib/stores/julia-terminal.store";
    import { juliaReplHistory, type ReplLine } from "$lib/stores/editor.store";

    // ── Terminal state (shared across all Julia tabs) ─────────────────────────

    let ts = $state(get(sharedTermState));

    // Persist local state changes back to the shared store
    $effect(() => {
        const snapshot = {
            activePanel:     ts.activePanel,
            termTabs:        ts.termTabs,
            termOutputLines: ts.termOutputLines,
            termIsRunning:   ts.termIsRunning,
            termExited:      ts.termExited,
            termCounter:     ts.termCounter,
            termInputValues: ts.termInputValues,
        };
        sharedTermState.set(snapshot);
    });

    // ── REPL lines (reactive from shared store) ───────────────────────────────

    let replLines = $derived<ReplLine[]>($juliaReplHistory);

    // ── REPL input state ──────────────────────────────────────────────────────

    let replInput      = $state('');
    let replCmdHistory: string[] = [];
    let historyIndex   = $state(-1);
    let savedInput     = '';
    let focusReplOnDone = false;

    let replOutputEl: HTMLDivElement;
    let replInputEl:  HTMLTextAreaElement;

    const replInputRows = $derived(Math.max(1, (replInput.match(/\n/g) ?? []).length + 1));

    let isRunning = $derived($juliaIsRunning);

    // ── Terminal output/input DOM refs ────────────────────────────────────────

    let termOutputEl: HTMLDivElement | undefined = $state(undefined);
    let termInputEl:  HTMLInputElement | undefined = $state(undefined);

    // Scroll terminal to bottom when active panel switches
    $effect(() => {
        void ts.activePanel;
        if (termOutputEl) {
            setTimeout(() => { termOutputEl!.scrollTop = termOutputEl!.scrollHeight; }, 0);
        }
    });

    // ── REPL helpers ──────────────────────────────────────────────────────────

    function scrollReplToBottom() {
        if (replOutputEl) {
            setTimeout(() => { replOutputEl.scrollTop = replOutputEl.scrollHeight; }, 0);
        }
    }

    function clearRepl() {
        juliaReplHistory.set([]);
    }

    async function runReplInput() {
        const code = replInput.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!code.trim() || isRunning) return;
        replInput      = '';
        historyIndex   = -1;
        savedInput     = '';
        replCmdHistory = [code, ...replCmdHistory];
        focusReplOnDone = true;
        await executeJuliaCode(code);
    }

    function handleReplKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            runReplInput();
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

    // ── Terminal helpers ──────────────────────────────────────────────────────

    function scrollTermToBottom() {
        if (termOutputEl) {
            setTimeout(() => { termOutputEl!.scrollTop = termOutputEl!.scrollHeight; }, 0);
        }
    }

    async function addTerminal() {
        ts.termCounter++;
        const id    = `term-${ts.termCounter}`;
        const label = `Terminal ${ts.termCounter}`;
        ts.termTabs             = [...ts.termTabs, { id, label }];
        ts.termOutputLines[id]  = [];
        ts.termIsRunning[id]    = false;
        ts.termInputValues[id]  = '';
        ts.termExited[id]       = false;
        ts.activePanel          = id;
        try {
            await invoke('start_terminal', { id });
        } catch (e) {
            ts.termOutputLines[id] = [{ text: String(e), is_stderr: true, is_input: false }];
            ts.termExited[id]      = true;
        }
    }

    async function closeTerminal(id: string) {
        try { await invoke('close_terminal', { id }); } catch { /* ignore */ }
        ts.termTabs = ts.termTabs.filter(t => t.id !== id);
        const { [id]: _ol, ...restOl } = ts.termOutputLines;
        const { [id]: _ir, ...restIr } = ts.termIsRunning;
        const { [id]: _iv, ...restIv } = ts.termInputValues;
        const { [id]: _ex, ...restEx } = ts.termExited;
        ts.termOutputLines  = restOl;
        ts.termIsRunning    = restIr;
        ts.termInputValues  = restIv;
        ts.termExited       = restEx;
        if (ts.activePanel === id) ts.activePanel = 'julia';
    }

    async function runTerminalCommand(id: string) {
        const cmd = (ts.termInputValues[id] ?? '').trim();
        if (!cmd || ts.termIsRunning[id] || ts.termExited[id]) return;
        ts.termInputValues[id] = '';
        ts.termIsRunning[id]   = true;
        ts.termOutputLines[id] = [...(ts.termOutputLines[id] ?? []),
            { text: cmd, is_stderr: false, is_input: true }];
        scrollTermToBottom();
        try {
            await invoke('send_terminal_input', { id, command: cmd });
        } catch (e) {
            ts.termOutputLines[id] = [...(ts.termOutputLines[id] ?? []),
                { text: String(e), is_stderr: true, is_input: false }];
            ts.termIsRunning[id] = false;
            scrollTermToBottom();
        }
    }

    // ── Event listeners ───────────────────────────────────────────────────────

    onMount(() => {
        const unlistenJulia = listen<{ chunk: string; is_done: boolean; error: string | null }>(
            'julia-output',
            (event) => {
                const { chunk, is_done, error } = event.payload;
                if (chunk) {
                    juliaReplHistory.update(h => [
                        ...h,
                        { text: chunk, kind: error ? 'error' : 'output' },
                    ]);
                }
                if (is_done) {
                    juliaIsRunning.set(false);
                    if (focusReplOnDone) {
                        focusReplOnDone = false;
                        requestAnimationFrame(() => replInputEl?.focus());
                    }
                }
                scrollReplToBottom();
            },
        );

        const unlistenTermOut = listen<{ id: string; line: string; is_stderr: boolean }>(
            'terminal-output',
            (event) => {
                const { id, line, is_stderr } = event.payload;
                if (!(id in ts.termOutputLines)) return;
                ts.termOutputLines[id] = [...(ts.termOutputLines[id] ?? []),
                    { text: line, is_stderr, is_input: false }];
                if (ts.activePanel === id) scrollTermToBottom();
            },
        );

        const unlistenTermDone = listen<{ id: string }>(
            'terminal-done',
            (event) => {
                const { id } = event.payload;
                if (!(id in ts.termIsRunning)) return;
                ts.termIsRunning[id] = false;
                if (ts.activePanel === id) scrollTermToBottom();
            },
        );

        const unlistenTermExit = listen<{ id: string }>(
            'terminal-exit',
            (event) => {
                const { id } = event.payload;
                if (!(id in ts.termExited)) return;
                ts.termExited[id]    = true;
                ts.termIsRunning[id] = false;
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

<div class="flex-1 flex flex-col rounded-md overflow-hidden border border-brand-sand-400 dark:border-[#414559] shadow-sm min-h-0 h-full">

    <!-- Tab bar -->
    <div class="flex items-center bg-brand-sand-200 dark:bg-[#292c3c] border-b border-brand-sand-400 dark:border-[#414559] shrink-0 overflow-x-auto">

        <!-- Julia REPL tab -->
        <div class="flex items-center flex-none border-r border-brand-sand-400 dark:border-[#414559]
                    {ts.activePanel === 'julia'
                        ? 'bg-brand-sand-50 dark:bg-[#414559]'
                        : 'hover:bg-brand-sand-100 dark:hover:bg-[#303446]'}">
            <button
                onclick={() => ts.activePanel = 'julia'}
                class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors select-none cursor-pointer
                       {ts.activePanel === 'julia'
                           ? 'text-brand-charcoal-700 dark:text-[#c6d0f5]'
                           : 'text-brand-charcoal-300 dark:text-[#838ba7]'}"
            >Julia REPL</button>
            {#if ts.activePanel === 'julia'}
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
        {#each ts.termTabs as tab (tab.id)}
            <div class="flex items-center flex-none border-r border-brand-sand-400 dark:border-[#414559]
                        {ts.activePanel === tab.id
                            ? 'bg-brand-sand-50 dark:bg-[#414559]'
                            : 'hover:bg-brand-sand-100 dark:hover:bg-[#303446]'}">
                <button
                    onclick={() => ts.activePanel = tab.id}
                    class="cursor-pointer px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors select-none
                           {ts.activePanel === tab.id
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
    {#if ts.activePanel === 'julia'}
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
                <span class="text-brand-gold-600 shrink-0 select-none font-semibold font-mono text-[11px] leading-relaxed pt-px">julia&gt;</span>
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
    {#each ts.termTabs as tab (tab.id)}
        {#if ts.activePanel === tab.id}
            <div class="flex-1 flex flex-col overflow-hidden min-h-0">
                <!-- Output -->
                <div
                    bind:this={termOutputEl}
                    class="flex-1 overflow-y-auto min-h-0 bg-brand-sand-50 dark:bg-[#232634] px-3 py-2 font-mono text-[11px] leading-relaxed"
                    role="log"
                    aria-label="Terminal output"
                >
                    {#if (ts.termOutputLines[tab.id] ?? []).length === 0 && !ts.termExited[tab.id]}
                        <p class="text-brand-charcoal-300 dark:text-[#626880] italic select-none">
                            Terminal ready. Type a command below and press Enter.
                        </p>
                    {:else}
                        {#each ts.termOutputLines[tab.id] ?? [] as line}
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
                        {#if ts.termExited[tab.id]}
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
                        bind:value={ts.termInputValues[tab.id]}
                        disabled={ts.termIsRunning[tab.id] || ts.termExited[tab.id]}
                        onkeydown={(e) => e.key === 'Enter' && runTerminalCommand(tab.id)}
                        placeholder={ts.termExited[tab.id] ? 'Process exited' : (ts.termIsRunning[tab.id] ? 'Running…' : 'Enter command, press Enter to run')}
                        class="flex-1 bg-transparent font-mono text-[11px] text-brand-charcoal-700 dark:text-[#c6d0f5]
                               outline-none placeholder-brand-charcoal-300 dark:placeholder-[#626880]
                               disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                </div>
            </div>
        {/if}
    {/each}

</div>
