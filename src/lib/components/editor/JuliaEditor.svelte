<script lang="ts">
    import { get } from "svelte/store";
    import { onDestroy } from "svelte";
    import { IS_APPLE } from "@lexical/utils";
    import {
        activeTab,
        activeTabId,
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
        appDarkMode,
    } from "$lib/stores/editor.store";
    import Icon from "@iconify/svelte";
    import {
        juliaIsRunning,
        executeJuliaCode,
        isIncompleteJulia,
        flashingTabId,
    } from "$lib/stores/julia-terminal.store";
    import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
    import SpellLanguageSelector from "./SpellLanguageSelector.svelte";
    import JuliaReplPane from "./JuliaReplPane.svelte";
    import type { KeyBinding } from "@codemirror/view";
    import type { Text } from "@codemirror/state";
    import {
        autocompletion,
        type Completion,
        type CompletionSource,
    } from "@codemirror/autocomplete";
    import { JULIA_COMPLETIONS } from "$lib/completions/julia";
    import { t } from "$lib/i18n";

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
                showFormatError($t("julia_editor.unexpected_formatter_response"));
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
    let editorScrollKey = $derived(effectiveTab?.path ?? effectiveTab?.id ?? null);

    // In a Julia split several editors are mounted at once (tabA/tabB in the left
    // column, an optional tabC on the right). Focusing a pane makes its tab the
    // active tab so Save / Cmd+S targets the file you're actually editing and its
    // dirty indicator clears. Mirrors TypstEditor's activateThisTab.
    function activateThisTab() {
        if (effectiveTab && effectiveTab.id !== $activeTabId) {
            activeTabId.set(effectiveTab.id);
        }
    }

    // ── Completion source ─────────────────────────────────────────────────────

    let isRunning = $derived($juliaIsRunning);
    let isFlashing = $derived($flashingTabId === effectiveTab?.id);

    const JULIA_IDENTIFIER_RE = /^[A-Za-z_]\w*[!?]?$/;

    function addDocumentCompletion(
        completions: Map<string, Completion>,
        label: string,
        type: Completion["type"],
        detail: string,
    ): void {
        const normalized = label.trim();
        if (!JULIA_IDENTIFIER_RE.test(normalized)) return;
        if (completions.has(normalized)) return;
        completions.set(normalized, {
            label: normalized,
            type,
            detail,
            boost: 99,
        });
    }

    function collectNamesFromList(
        rawList: string,
        completions: Map<string, Completion>,
        type: Completion["type"],
        detail: string,
    ): void {
        for (const segment of rawList.replace(/;/g, ",").split(",")) {
            const match = segment
                .trim()
                .match(/^([A-Za-z_]\w*[!?]?)(?=\s*(?:::\s*[^=]+)?(?:=|$))/);
            if (match) addDocumentCompletion(completions, match[1], type, detail);
        }
    }

    function collectFunctionArgs(
        rawArgs: string,
        completions: Map<string, Completion>,
    ): void {
        collectNamesFromList(rawArgs, completions, "variable", "argument");
    }

    // Scanning the whole document (split + several regexes per line) is the
    // bulk of a completion query's cost. CodeMirror re-invokes the source on
    // every new word and on deletions, so memoize the last scan: while the
    // document text is unchanged, successive queries (different prefixes, REPL
    // retries, info rendering) reuse the parsed name set instead of re-parsing.
    let docScanCacheSource: string | null = null;
    let docScanCache: Map<string, Completion> = new Map();

    function scanDocumentCompletions(source: string): Map<string, Completion> {
        if (source === docScanCacheSource) return docScanCache;
        const completions = new Map<string, Completion>();
        scanDocumentInto(source, completions);
        docScanCacheSource = source;
        docScanCache = completions;
        return completions;
    }

    function collectDocumentCompletions(
        source: string,
        prefix: string,
    ): Completion[] {
        const completions = scanDocumentCompletions(source);
        const lowerPrefix = prefix.toLowerCase();
        const out: Completion[] = [];
        for (const completion of completions.values()) {
            if (completion.label.toLowerCase().startsWith(lowerPrefix)) {
                out.push(completion);
            }
        }
        return out;
    }

    function scanDocumentInto(
        source: string,
        completions: Map<string, Completion>,
    ): void {
        for (const rawLine of source.split("\n")) {
            const line = rawLine.replace(/#.*$/, "").trim();
            if (!line) continue;

            const functionMatch = line.match(
                /^function\s+([A-Za-z_]\w*[!?]?)\s*\(([^)]*)\)/,
            );
            if (functionMatch) {
                addDocumentCompletion(
                    completions,
                    functionMatch[1],
                    "function",
                    "defined in file",
                );
                collectFunctionArgs(functionMatch[2], completions);
                continue;
            }

            const shortFunctionMatch = line.match(
                /^([A-Za-z_]\w*[!?]?)\s*\(([^)]*)\)\s*=/,
            );
            if (shortFunctionMatch) {
                addDocumentCompletion(
                    completions,
                    shortFunctionMatch[1],
                    "function",
                    "defined in file",
                );
                collectFunctionArgs(shortFunctionMatch[2], completions);
            }

            const assignmentMatch = line.match(
                /^(?:const|local|global)\s+(.+)$|^([A-Za-z_]\w*[!?]?)\s*(?:::\s*[^=]+)?=(?!=)/,
            );
            if (assignmentMatch?.[1]) {
                collectNamesFromList(
                    assignmentMatch[1],
                    completions,
                    "variable",
                    "defined in file",
                );
            } else if (assignmentMatch?.[2]) {
                addDocumentCompletion(
                    completions,
                    assignmentMatch[2],
                    "variable",
                    "defined in file",
                );
            }

            const letMatch = line.match(/^let\s+(.+)$/);
            if (letMatch) {
                collectNamesFromList(
                    letMatch[1],
                    completions,
                    "variable",
                    "let binding",
                );
            }

            const forMatch = line.match(/^for\s+(.+?)\s+in\b/);
            if (forMatch) {
                collectNamesFromList(
                    forMatch[1].replace(/[()]/g, ""),
                    completions,
                    "variable",
                    "loop variable",
                );
            }
        }
    }

    function mergeCompletions(...groups: Completion[][]): Completion[] {
        const merged = new Map<string, Completion>();
        for (const group of groups) {
            for (const completion of group) {
                if (!merged.has(completion.label)) {
                    merged.set(completion.label, completion);
                }
            }
        }
        return [...merged.values()];
    }

    // Precompute each static completion's lowercased label once, so prefix
    // filtering on every query is a plain compare instead of ~400 toLowerCase()
    // allocations per keystroke.
    const JULIA_COMPLETIONS_INDEXED = JULIA_COMPLETIONS.map((c) => ({
        completion: c,
        lower: c.label.toLowerCase(),
    }));

    const juliaCompletionSource: CompletionSource = async (context) => {
        const word = context.matchBefore(/\w+/);
        if (!word || (word.from === word.to && !context.explicit)) return null;

        const documentCompletions = collectDocumentCompletions(
            context.state.doc.toString(),
            word.text,
        );

        let replCompletions: Completion[] = [];

        if (get(juliaReplStarted) && !get(juliaIsRunning)) {
            try {
                const { invoke } = await import("@tauri-apps/api/core");
                const labels = await invoke<string[]>(
                    "julia_complete",
                    { prefix: word.text },
                );
                replCompletions = labels.map((label) => ({
                    label,
                    type: "function",
                }));
            } catch {
                // fall through to static completions
            }
        }

        const lower = word.text.toLowerCase();
        const staticCompletions: Completion[] = [];
        for (const entry of JULIA_COMPLETIONS_INDEXED) {
            if (entry.lower.startsWith(lower)) {
                staticCompletions.push(entry.completion);
            }
        }
        const options = mergeCompletions(
            documentCompletions,
            replCompletions,
            staticCompletions,
        );

        if (options.length === 0) return null;
        return { from: word.from, options, validFor: /^\w*$/ };
    };

    const juliaCompletionExtension = autocompletion({
        override: [juliaCompletionSource],
        // Debounce so a typing/deleting burst doesn't fire the (document-scan +
        // REPL IPC) source on every keystroke, and cap rendered DOM options.
        activateOnTypingDelay: 150,
        maxRenderedOptions: 50,
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

    const REPL_DEFAULT_HEIGHT = 256;
    let replHeight = $state(REPL_DEFAULT_HEIGHT);
    let dragStartY = 0;
    let dragStartHeight = 0;
    let containerEl: HTMLDivElement;

    // Cursor-following gradient highlight on the divider, matching StackSplitDivider.
    let dividerHovering = $state(false);
    let dividerDragging = $state(false);
    let dividerCursorX = $state(0);
    let dividerHandleEl: HTMLElement | null = null;
    let dividerActive = $derived(dividerHovering || dividerDragging);
    let highlightColor = $derived($appDarkMode ? "229, 200, 144" : "212, 161, 64");
    let highlightStrength = $derived(dividerDragging ? 0.85 : 0.55);

    function updateDividerCursorX(e: PointerEvent, el: HTMLElement) {
        const rect = el.getBoundingClientRect();
        dividerCursorX = e.clientX - rect.left;
    }
    function onDividerMove(e: PointerEvent) {
        updateDividerCursorX(e, e.currentTarget as HTMLElement);
    }

    function startDrag(e: PointerEvent) {
        dividerHandleEl = e.currentTarget as HTMLElement;
        dividerDragging = true;
        try { dividerHandleEl.setPointerCapture(e.pointerId); } catch {}
        dragStartY = e.clientY;
        dragStartHeight = replHeight;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", stopDrag, { once: true });
    }
    function onDrag(e: PointerEvent) {
        if (dividerHandleEl) updateDividerCursorX(e, dividerHandleEl);
        const delta = dragStartY - e.clientY;
        const maxH = containerEl
            ? Math.max(120, containerEl.offsetHeight - 120 - 6)
            : dragStartHeight * 2;
        replHeight = Math.max(120, Math.min(maxH, dragStartHeight + delta));
    }
    function stopDrag(e: PointerEvent) {
        dividerDragging = false;
        if (dividerHandleEl) {
            try { dividerHandleEl.releasePointerCapture(e.pointerId); } catch {}
        }
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
    onfocusin={activateThisTab}
    class="relative overflow-visible flex flex-col h-full"
>
    <!-- Editor area -->
    <div class="flex-1 flex flex-col min-h-0" style="min-height: 120px">
        <div class="flex items-center justify-between px-2 pt-1 mb-1">
            <span
                class="text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300"
                >{effectiveTab?.name ??
                    $t("julia_editor.fallback_name")}{#if effectiveTab?.isDirty}<span
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
                <!-- Spelling language -->
                <SpellLanguageSelector />
                <!-- Julia Formatter -->
                <button
                    onclick={formatJulia}
                    disabled={formatting}
                    title={$t("julia_cell.format")}
                    class="flex cursor-pointer items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors
                           bg-brand-gold-100 dark:bg-[#e5c890]/15 text-brand-gold-600 dark:text-brand-gold-400
                           hover:bg-brand-gold-200 dark:hover:bg-[#e5c890]/25
                           disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Icon icon="icon-park-twotone:format-brush" width="11" />
                    {formatting ? $t("julia_editor.formatting") : $t("julia_editor.format")}
                </button>
                <!-- Line wrap toggle -->
                <button
                    onclick={() => (lineWrap = !lineWrap)}
                    title={lineWrap ? $t("julia_cell.disable_wrap") : $t("julia_cell.enable_wrap")}
                    class="flex cursor-pointer items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors
                       {lineWrap
                        ? 'bg-brand-sand-200 dark:bg-[#414559] text-brand-charcoal-500 dark:text-[#838ba7] hover:bg-brand-sand-400 dark:hover:bg-[#51566a]'
                        : 'bg-brand-gold-100 dark:bg-[#e5c890]/15 text-brand-gold-600 dark:text-brand-gold-400 hover:bg-brand-gold-200 dark:hover:bg-[#e5c890]/25'}"
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
                    {lineWrap ? $t("julia_editor.wrap") : $t("julia_editor.no_wrap")}
                </button>
            </div>
        </div>
        {#if formatError}
            {@const isReplDown =
                /repl|kernel|not started|not running|connect/i.test(
                    formatError,
                )}
            <div
                role="alert"
                class="julia-format-alert font-sans mx-2 mb-1.5 flex items-start gap-2 px-2.5 py-2
                       rounded-md border shadow-sm
                       {isReplDown
                    ? 'bg-amber-50/90 dark:bg-amber-900/15 border-amber-200/80 dark:border-amber-700/40'
                    : 'bg-red-50/90 dark:bg-red-900/15 border-red-200/80 dark:border-red-700/40'}"
            >
                <span
                    class="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full
                           {isReplDown
                        ? 'bg-amber-100 dark:bg-amber-800/40 text-amber-600 dark:text-amber-300'
                        : 'bg-red-100 dark:bg-red-800/40 text-red-600 dark:text-red-300'}"
                >
                    <Icon
                        icon={isReplDown
                            ? "lucide:plug-zap"
                            : "lucide:alert-triangle"}
                        width="0.7rem"
                        height="0.7rem"
                    />
                </span>
                <div class="min-w-0 flex-1 leading-tight">
                    <div
                        class="text-[11px] font-semibold
                               {isReplDown
                            ? 'text-amber-800 dark:text-amber-200'
                            : 'text-red-700 dark:text-red-200'}"
                    >
                        {isReplDown
                            ? $t("julia_cell.repl_not_running")
                            : $t("julia_editor.format_failed_file")}
                    </div>
                    <div
                        class="mt-1.5 text-[10.5px] break-words
                               {isReplDown
                            ? 'text-amber-700/90 dark:text-amber-300/90'
                            : 'text-red-600/90 dark:text-red-300/90'}"
                    >
                        {isReplDown
                            ? $t("julia_editor.start_repl_then_format")
                            : formatError}
                    </div>
                </div>
                <button
                    type="button"
                    aria-label={$t("common.close")}
                    onclick={() => {
                        formatError = "";
                        if (formatErrorTimer) clearTimeout(formatErrorTimer);
                    }}
                    class="shrink-0 -mr-0.5 -mt-0.5 p-1 rounded
                           text-current opacity-60 hover:opacity-100
                           hover:bg-black/5 dark:hover:bg-white/10 transition"
                >
                    <Icon icon="lucide:x" width="0.7rem" height="0.7rem" />
                </button>
            </div>
        {/if}
        {#if effectiveTab}
            <div
                class="flex-1 min-h-0 rounded-md mx-2 border border-brand-sand-200 overflow-hidden {isFlashing
                    ? 'flash-border-anim'
                    : ''} {hideRepl ? 'mb-3' : ''}"
            >
                <CodeMirrorEditor
                    value={effectiveTab?.content ?? ""}
                    language="julia"
                    extraKeymap={juliaKeymap}
                    extensions={[juliaCompletionExtension]}
                    {lineWrap}
                    aiSelectionTools={true}
                    {aiContextPrompt}
                    {askAiContextPrompt}
                    filePath={effectiveTab?.path ?? null}
                    scrollKey={editorScrollKey}
                    ownerTabId={effectiveTab?.id ?? null}
                    onchange={handleInput}
                    class="h-full font-mono"
                />
            </div>
        {/if}
    </div>

    <!-- Embedded REPL / Terminal panel (hidden when panel is on the right side) -->
    {#if !hideRepl}
        <!-- Draggable splitter — cursor-following gradient highlight (matches
             the split-mode StackSplitDivider for visual consistency). The -mx-1
             extends the tail flush against the vertical column divider. -->
        <div class="relative z-1 flex-none h-1.5 -mx-1 select-none">
            <!-- Hit area: taller than visible, centered on the seam. -->
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize the REPL panel"
                onpointerdown={startDrag}
                onpointermove={onDividerMove}
                onpointerenter={() => (dividerHovering = true)}
                onpointerleave={() => (dividerHovering = false)}
                ondblclick={() => (replHeight = REPL_DEFAULT_HEIGHT)}
                title="Drag to resize · Double-click to reset"
                class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 cursor-row-resize"
            ></div>
            <!-- Cursor-following highlight, only visible while hovering / dragging. -->
            <span
                class="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-px
                       transition-opacity duration-150"
                style="opacity: {dividerActive ? 1 : 0};
                       background: radial-gradient(
                           circle at {dividerCursorX}px 50%,
                           rgba({highlightColor}, {highlightStrength}) 0px,
                           rgba({highlightColor}, {highlightStrength * 0.5}) 40px,
                           rgba({highlightColor}, 0) 140px
                       );"
            ></span>
        </div>
        <!-- Framed the same way LeanEditor frames its infoview, so the two
             editors present their bottom pane identically. -->
        <div
            class="flex-none flex flex-col mx-2 mb-2 overflow-hidden rounded-md border border-brand-sand-200 dark:border-[#414559]"
            style:height="{replHeight}px"
        >
            <JuliaReplPane embedded={true} />
        </div>
    {/if}
</div>

<style>
    .julia-format-alert {
        animation: julia-format-alert-in 160ms ease-out;
    }
    @keyframes julia-format-alert-in {
        from {
            opacity: 0;
            transform: translateY(-2px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
