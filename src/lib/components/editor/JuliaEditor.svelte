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
    import {
        juliaReplStarted,
        zenMode,
        zenPeek,
        editorIndentSize,
        codeMirrorViewInstance,
    } from "$lib/stores/editor.store";
    import Icon from "@iconify/svelte";
    import {
        juliaIsRunning,
        executeJuliaCode,
        isIncompleteJulia,
        flashingTabId,
    } from "$lib/stores/julia-terminal.store";
    import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
    import JuliaReplPane from "./JuliaReplPane.svelte";
    import type { KeyBinding } from "@codemirror/view";
    import type { Text } from "@codemirror/state";
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

    let lineWrap = $state(false);

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
        const view = get(codeMirrorViewInstance);
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
            });
            if (line.startsWith("OK:")) {
                const formatted = b64ToUtf8(line.slice(3));
                // Full-document replace, kept in the editor's undo history.
                if (formatted !== view.state.doc.toString()) {
                    view.dispatch({
                        changes: {
                            from: 0,
                            to: view.state.doc.length,
                            insert: formatted,
                        },
                    });
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

    const aiContextPrompt =
        "This text is part of a Julia programming file, so your output should be a julia code";

    const askAiContextPrompt =
        "This text is part of a Julia programming file, help provide explanation or correction on the code";
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
    let containerEl: HTMLDivElement;

    function startDrag(e: PointerEvent) {
        dragStartY = e.clientY;
        dragStartHeight = replHeight;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", stopDrag, { once: true });
    }
    function onDrag(e: PointerEvent) {
        const delta = dragStartY - e.clientY;
        const maxH = containerEl
            ? Math.max(120, containerEl.offsetHeight - 120 - 6)
            : dragStartHeight * 2;
        replHeight = Math.max(120, Math.min(maxH, dragStartHeight + delta));
    }
    function stopDrag() {
        window.removeEventListener("pointermove", onDrag);
    }

    onDestroy(() => {
        window.removeEventListener("pointermove", onDrag);
    });

    // Find the top-level statement (line range) that contains `cursorLine`.
    // Walks the document from the top, growing a candidate statement line by
    // line until it parses as complete Julia, so a cursor anywhere inside a
    // function/block resolves to that whole construct — not just its one line.
    function enclosingStatementRange(
        doc: Text,
        cursorLine: number,
    ): { start: number; end: number } {
        let stmtStart = 1;
        for (let line = 1; line <= doc.lines; line++) {
            const snippet = doc.sliceString(
                doc.line(stmtStart).from,
                doc.line(line).to,
            );
            if (!isIncompleteJulia(snippet)) {
                if (cursorLine >= stmtStart && cursorLine <= line) {
                    return { start: stmtStart, end: line };
                }
                stmtStart = line + 1;
            }
        }
        // Cursor sits inside an unterminated trailing block — run to the end.
        return { start: stmtStart, end: doc.lines };
    }

    // First line at or below `fromLine` that holds actual code — blank lines
    // and full-line comments (`#`, `#=`) are skipped so repeated Mod-Enter
    // presses land only on runnable code.
    function nextCodeLine(doc: Text, fromLine: number): number | null {
        for (let line = fromLine; line <= doc.lines; line++) {
            const text = doc.line(line).text.trim();
            if (text !== "" && !text.startsWith("#")) return line;
        }
        return null;
    }

    const juliaKeymap: KeyBinding[] = [
        {
            key: "Mod-Enter",
            run(view) {
                const { from, to } = view.state.selection.main;
                if (from !== to) {
                    executeCode(view.state.sliceDoc(from, to));
                    return true;
                }
                // No selection: run the whole enclosing top-level statement, so
                // hitting Mod-Enter from the header, body, or `end` of a
                // function all re-run that entire function.
                const doc = view.state.doc;
                const cursorLine = doc.lineAt(from).number;
                const { start, end } = enclosingStatementRange(doc, cursorLine);
                const snippet = doc.sliceString(
                    doc.line(start).from,
                    doc.line(end).to,
                );
                executeCode(snippet);
                // Advance the cursor to the next runnable line, skipping over
                // blank lines and comments.
                const target = nextCodeLine(doc, end + 1);
                if (target !== null) {
                    const nextLine = doc.line(target);
                    view.dispatch({
                        selection: { anchor: nextLine.from },
                        scrollIntoView: true,
                    });
                }
                return true;
            },
        },
    ];
</script>

<div
    bind:this={containerEl}
    class="relative overflow-visible flex flex-col h-full"
>
    <!-- Editor area -->
    <div class="flex-1 flex flex-col min-h-0" style="min-height: 120px">
        <div class="flex items-center justify-between px-2 pt-1 mb-1">
            <span
                class="text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300"
                >{effectiveTab?.name ??
                    "Julia Editor"}{#if effectiveTab?.isDirty}<span
                        class="text-brand-gold-500 dark:text-[#e5c890]"
                    >
                        *</span
                    >{/if}</span
            >
            <div
                class="flex items-center gap-1.5 {$zenMode
                    ? $zenPeek
                        ? 'opacity-50 transition-opacity duration-200'
                        : 'opacity-0 hover:opacity-100 transition-opacity duration-200'
                    : ''}"
            >
                <!-- Julia Formatter -->
                <button
                    onclick={formatJulia}
                    disabled={formatting}
                    title="Format with JuliaFormatter.jl"
                    class="flex cursor-pointer items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors
                           bg-brand-gold-100 dark:bg-brand-gold-400/15 text-brand-gold-600 dark:text-brand-gold-400
                           hover:bg-brand-gold-200 dark:hover:bg-brand-gold-400/25
                           disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Icon
                        icon="solar:magic-stick-3-bold-duotone"
                        width="11"
                    />
                    {formatting ? "Formatting…" : "Format"}
                </button>
                <!-- Line wrap toggle -->
                <button
                    onclick={() => (lineWrap = !lineWrap)}
                    title={lineWrap
                        ? "Disable line wrap"
                        : "Enable line wrap"}
                    class="flex cursor-pointer items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors
                       {lineWrap
                        ? 'bg-brand-sand-200 dark:bg-[#414559] text-brand-charcoal-500 dark:text-[#838ba7] hover:bg-brand-sand-400 dark:hover:bg-[#51566a]'
                        : 'bg-brand-gold-100 dark:bg-brand-gold-400/15 text-brand-gold-600 dark:text-brand-gold-400 hover:bg-brand-gold-200 dark:hover:bg-brand-gold-400/25'}"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <polyline points="3 6 21 6" /><path
                            d="M3 12h15a3 3 0 0 1 0 6h-4"
                        /><polyline points="8 15 5 18 8 21" />
                    </svg>
                    {lineWrap ? "Wrap" : "No Wrap"}
                </button>
            </div>
        </div>
        {#if formatError}
            <div
                class="mx-2 mb-1 px-2 py-1 rounded-md text-[10px] text-red-500 dark:text-red-400
                       bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40"
            >
                {formatError}
            </div>
        {/if}
        {#if effectiveTab}
            <div
                class="flex-1 min-h-0 rounded-md mx-2 border border-brand-sand-200 overflow-hidden {isFlashing
                    ? 'flash-border-anim'
                    : ''} {hideRepl ? 'mb-3' : ''}"
            >
                <CodeMirrorEditor
                    value={effectiveTab.content}
                    language="julia"
                    extraKeymap={juliaKeymap}
                    extensions={[juliaCompletionExtension]}
                    {lineWrap}
                    aiSelectionTools={true}
                    {aiContextPrompt}
                    {askAiContextPrompt}
                    filePath={effectiveTab.path ?? null}
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
            <div
                class="w-8 h-0.5 rounded-full bg-brand-sand-400 dark:bg-[#414559]
                        group-hover:bg-brand-gold-400 transition-colors"
            ></div>
        </div>
        <div class="flex-none flex flex-col p-2" style:height="{replHeight}px">
            <JuliaReplPane />
        </div>
    {/if}
</div>
