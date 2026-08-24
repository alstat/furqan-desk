<script lang="ts">
    import { get } from "svelte/store";
    import { onDestroy, onMount } from "svelte";
    import {
        activeTab,
        activeTabId,
        setActiveTabContent,
        setTabContent,
        tabs,
    } from "$lib/stores/tabs.store";
    import Icon from "@iconify/svelte";
    import {
        zenMode,
        zenPeek,
        codeMirrorViewInstance,
        appDarkMode,
        editorIndentSize,
    } from "$lib/stores/editor.store";
    import { formatLeanSource } from "$lib/utils/leanFormat";
    import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
    import SpellLanguageSelector from "./SpellLanguageSelector.svelte";
    import LeanInfoviewPane from "./LeanInfoviewPane.svelte";
    import {
        leanEditorRuntime,
        leanLiveCompile,
        LIVE_COMPILE_DEBOUNCE_MS,
    } from "$lib/stores/lean-compiler.store";
    import {
        isLeanInstalled,
        openLeanInstallPrompt,
        maybeOfferLeanInstall,
    } from "$lib/stores/lean-install.store";
    import type { KeyBinding } from "@codemirror/view";
    import {
        autocompletion,
        type Completion,
        type CompletionSource,
    } from "@codemirror/autocomplete";
    import { LEAN_COMPLETIONS } from "$lib/completions/lean";
    import { t } from "$lib/i18n";

    /**
     * tabId — when set, this editor shows a specific (secondary/split) tab
     *         instead of the currently active tab.
     * hideInfoview — when true, the bottom infoview panel is hidden (used when
     *         it is displayed elsewhere in the layout instead).
     */
    let {
        tabId = null,
        hideInfoview = false,
    }: { tabId?: string | null; hideInfoview?: boolean } = $props();

    let lineWrap = $state(false);

    const aiContextPrompt =
        "This text is part of a Lean 4 programming file, so your output should be Lean 4 code";

    const askAiContextPrompt =
        "This text is part of a Lean 4 programming file, help provide explanation or correction on the code";

    // ── Effective tab (primary uses $activeTab; secondary uses tabId prop) ─────

    let effectiveTab = $derived(
        tabId ? ($tabs.find((t) => t.id === tabId) ?? null) : $activeTab,
    );
    let editorScrollKey = $derived(
        effectiveTab?.path ?? effectiveTab?.id ?? null,
    );

    // Focusing a pane makes its tab the active tab so Save / Cmd+S targets the
    // file you're actually editing. Mirrors JuliaEditor's activateThisTab.
    function activateThisTab() {
        if (effectiveTab && effectiveTab.id !== $activeTabId) {
            activeTabId.set(effectiveTab.id);
        }
    }

    // ── Compilation ───────────────────────────────────────────────────────────

    function currentCode(): string {
        return effectiveTab?.content ?? "";
    }

    /**
     * Compile the buffer, first making sure a toolchain exists. Checking up
     * front means a user who has never installed Lean sees the install prompt
     * rather than a raw "Lean is not installed" string in the infoview.
     */
    async function compileNow() {
        // Compiling from a background pane makes that pane authoritative, so
        // the shared infoview describes the file the user just acted on.
        activateThisTab();
        if (effectiveTab) leanEditorRuntime.focusTab(effectiveTab.id);
        if (!(await isLeanInstalled())) {
            openLeanInstallPrompt();
            return;
        }
        await leanEditorRuntime.compile(currentCode(), true);
    }

    /** True when this pane owns the shared infoview — i.e. it holds the active
     *  tab. In a split several editors are mounted against one runtime, so only
     *  this one may drive it; otherwise all three would race to compile their
     *  own source and the infoview would show whichever finished last. */
    let isDriving = $derived(!!effectiveTab && effectiveTab.id === $activeTabId);

    // Keep the infoview pointed at the active tab: switching panes drops the
    // previous file's messages rather than anchoring them to this one's lines.
    $effect(() => {
        if (isDriving && effectiveTab) {
            leanEditorRuntime.focusTab(effectiveTab.id);
        }
    });

    // Live compilation: recompile after a pause in typing. The debounce lives
    // in the runtime, and the Rust side kills the superseded process, so
    // holding a key down never queues up a backlog of compiles.
    $effect(() => {
        const code = effectiveTab?.content ?? "";
        const live = $leanLiveCompile;
        if (!live || !isDriving || !code.trim()) return;
        leanEditorRuntime.scheduleCompile(code, LIVE_COMPILE_DEBOUNCE_MS);
    });

    // Turning live mode off should also drop whatever it had queued or running.
    let wasLive = $leanLiveCompile;
    $effect(() => {
        const live = $leanLiveCompile;
        if (wasLive && !live) void leanEditorRuntime.cancel();
        wasLive = live;
    });

    onMount(() => {
        // Creating or opening a .lean file is the moment to find out whether a
        // toolchain exists, so the offer to install lands before the first
        // compile rather than as a surprise mid-edit. The offer is made at most
        // once per session and never blocks: declining leaves the file open and
        // fully editable, and accepting hands the download to the background
        // toast. A split mounts several Lean editors at once — the store gates
        // that down to a single prompt.
        void maybeOfferLeanInstall();
        return leanEditorRuntime.retain();
    });

    onDestroy(() => {
        window.removeEventListener("pointermove", onDrag);
    });

    // ── Lean formatter ────────────────────────────────────────────────────────
    // Whitespace only — see leanFormat.ts for why it stops short of the
    // re-indenting the Julia formatter does.
    function formatLean() {
        const view = get(codeMirrorViewInstance);
        if (!view) return;
        const code = view.state.doc.toString();
        if (!code.trim()) return;
        const formatted = formatLeanSource(code, {
            indentSize: get(editorIndentSize),
        });
        if (formatted === code) return;
        // Full-document replace, kept in the editor's undo history.
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: formatted },
        });
    }

    /** Move the caret to a diagnostic's position (Lean: 1-based line, 0-based col). */
    function jumpTo(line: number, column: number) {
        const view = get(codeMirrorViewInstance);
        if (!view) return;
        const lineNo = Math.max(1, Math.min(view.state.doc.lines, line));
        const docLine = view.state.doc.line(lineNo);
        const pos = Math.min(docLine.from + column, docLine.to);
        view.dispatch({
            selection: { anchor: pos },
            scrollIntoView: true,
        });
        view.focus();
    }

    // ── Completion source ─────────────────────────────────────────────────────

    // Lean identifiers are unicode-heavy and may contain `.`, `'`, `!`, `?`.
    const LEAN_IDENTIFIER_RE = /^[A-Za-z_À-ɏͰ-Ͽ][\w.'!?À-ɏͰ-Ͽ]*$/;

    function addDocumentCompletion(
        completions: Map<string, Completion>,
        label: string,
        type: Completion["type"],
        detail: string,
    ): void {
        const normalized = label.trim();
        if (!LEAN_IDENTIFIER_RE.test(normalized)) return;
        if (completions.has(normalized)) return;
        completions.set(normalized, { label: normalized, type, detail, boost: 99 });
    }

    // Scanning the document is the bulk of a completion query's cost, and
    // CodeMirror re-invokes the source on every new word. Memoize the last scan
    // so successive queries against unchanged text reuse the parsed name set.
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

    function scanDocumentInto(
        source: string,
        completions: Map<string, Completion>,
    ): void {
        for (const rawLine of source.split("\n")) {
            const line = rawLine.replace(/--.*$/, "").trim();
            if (!line) continue;

            // `def foo`, `theorem bar`, `structure Baz`, … — anything that
            // introduces a name, with the optional modifier prefixes stripped.
            const declMatch = line.match(
                /^(?:@\[[^\]]*\]\s*)?(?:(?:private|protected|noncomputable|partial|unsafe|scoped|local)\s+)*(def|theorem|lemma|abbrev|instance|structure|class|inductive|axiom|opaque)\s+([A-Za-z_À-ɏͰ-Ͽ][\w.'!?À-ɏͰ-Ͽ]*)/,
            );
            if (declMatch) {
                const kind = declMatch[1];
                const type: Completion["type"] =
                    kind === "structure" ||
                    kind === "class" ||
                    kind === "inductive"
                        ? "type"
                        : kind === "theorem" || kind === "lemma"
                          ? "constant"
                          : "function";
                addDocumentCompletion(
                    completions,
                    declMatch[2],
                    type,
                    `${kind} in file`,
                );
                continue;
            }

            // `variable (n : Nat)` / `let x := …` / `have h : P := …`
            const bindMatch = line.match(
                /^(?:variable|let|have)\s+\(?\s*([A-Za-z_À-ɏͰ-Ͽ][\w'!?À-ɏͰ-Ͽ]*)/,
            );
            if (bindMatch) {
                addDocumentCompletion(
                    completions,
                    bindMatch[1],
                    "variable",
                    "binding in file",
                );
                continue;
            }

            // `| ctor : …` — inductive constructors.
            const ctorMatch = line.match(
                /^\|\s*([A-Za-z_À-ɏͰ-Ͽ][\w'!?À-ɏͰ-Ͽ]*)/,
            );
            if (ctorMatch) {
                addDocumentCompletion(
                    completions,
                    ctorMatch[1],
                    "enum",
                    "constructor in file",
                );
            }
        }
    }

    // Precompute each static completion's lowercased label once, so prefix
    // filtering on every query is a plain compare rather than hundreds of
    // toLowerCase() allocations per keystroke.
    const LEAN_COMPLETIONS_INDEXED = LEAN_COMPLETIONS.map((c) => ({
        completion: c,
        lower: c.label.toLowerCase(),
    }));

    const leanCompletionSource: CompletionSource = (context) => {
        // `#eval`-style commands start with `#`; dotted names (`List.map`) and
        // primed names (`h'`) must stay in one token for prefix matching.
        const word = context.matchBefore(/#?[\w.'!?]+/);
        if (!word || (word.from === word.to && !context.explicit)) return null;

        const prefix = word.text;
        const lower = prefix.toLowerCase();

        const options: Completion[] = [];
        const seen = new Set<string>();

        for (const completion of scanDocumentCompletions(
            context.state.doc.toString(),
        ).values()) {
            if (completion.label.toLowerCase().startsWith(lower)) {
                options.push(completion);
                seen.add(completion.label);
            }
        }
        for (const entry of LEAN_COMPLETIONS_INDEXED) {
            if (entry.lower.startsWith(lower) && !seen.has(entry.completion.label)) {
                options.push(entry.completion);
                seen.add(entry.completion.label);
            }
        }

        if (options.length === 0) return null;
        return { from: word.from, options, validFor: /^#?[\w.'!?]*$/ };
    };

    const leanCompletionExtension = autocompletion({
        override: [leanCompletionSource],
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

    // ── Editor keymap ─────────────────────────────────────────────────────────

    const leanKeymap: KeyBinding[] = [
        {
            key: "Mod-Enter",
            run() {
                // Lean elaborates whole files, not statements, so there is no
                // "run this line" — Mod-Enter compiles the buffer, which is
                // what the infoview reflects.
                void compileNow();
                return true;
            },
        },
    ];

    // ── Draggable infoview splitter ───────────────────────────────────────────

    const INFOVIEW_DEFAULT_HEIGHT = 256;
    let infoviewHeight = $state(INFOVIEW_DEFAULT_HEIGHT);
    let dragStartY = 0;
    let dragStartHeight = 0;
    let containerEl: HTMLDivElement;

    // Cursor-following gradient highlight on the divider, matching JuliaEditor.
    let dividerHovering = $state(false);
    let dividerDragging = $state(false);
    let dividerCursorX = $state(0);
    let dividerHandleEl: HTMLElement | null = null;
    let dividerActive = $derived(dividerHovering || dividerDragging);
    let highlightColor = $derived(
        $appDarkMode ? "229, 200, 144" : "212, 161, 64",
    );
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
        try {
            dividerHandleEl.setPointerCapture(e.pointerId);
        } catch {
            // Pointer capture is best-effort; dragging still works without it.
        }
        dragStartY = e.clientY;
        dragStartHeight = infoviewHeight;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", stopDrag, { once: true });
    }
    function onDrag(e: PointerEvent) {
        if (dividerHandleEl) updateDividerCursorX(e, dividerHandleEl);
        const delta = dragStartY - e.clientY;
        const maxH = containerEl
            ? Math.max(120, containerEl.offsetHeight - 120 - 6)
            : dragStartHeight * 2;
        infoviewHeight = Math.max(
            120,
            Math.min(maxH, dragStartHeight + delta),
        );
    }
    function stopDrag(e: PointerEvent) {
        dividerDragging = false;
        if (dividerHandleEl) {
            try {
                dividerHandleEl.releasePointerCapture(e.pointerId);
            } catch {
                // Already released — nothing to undo.
            }
        }
        window.removeEventListener("pointermove", onDrag);
    }
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
                    $t("lean_editor.fallback_name")}{#if effectiveTab?.isDirty}<span
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

                <!-- Lean formatter -->
                <button
                    onclick={formatLean}
                    title={$t("lean_editor.format_title")}
                    class="flex cursor-pointer items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors
                           bg-brand-gold-100 dark:bg-[#e5c890]/15 text-brand-gold-600 dark:text-brand-gold-400
                           hover:bg-brand-gold-200 dark:hover:bg-[#e5c890]/25"
                >
                    <Icon icon="icon-park-twotone:format-brush" width="11" />
                    {$t("lean_editor.format")}
                </button>

                <!-- Live / Compile live in the infoview's own header — that is
                     the panel they act on, and keeping them there means the
                     controls sit with the output they produce whether the
                     infoview is embedded below or split into the right column.
                     Mod-Enter still compiles from here. -->

                <!-- Line wrap toggle -->
                <button
                    onclick={() => (lineWrap = !lineWrap)}
                    title={lineWrap
                        ? $t("julia_cell.disable_wrap")
                        : $t("julia_cell.enable_wrap")}
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
                    {lineWrap
                        ? $t("julia_editor.wrap")
                        : $t("julia_editor.no_wrap")}
                </button>
            </div>
        </div>

        {#if effectiveTab}
            <div
                class="flex-1 min-h-0 rounded-md mx-2 border border-brand-sand-200 overflow-hidden {hideInfoview
                    ? 'mb-3'
                    : ''}"
            >
                <CodeMirrorEditor
                    value={effectiveTab.content}
                    language="lean"
                    extraKeymap={leanKeymap}
                    extensions={[leanCompletionExtension]}
                    {lineWrap}
                    aiSelectionTools={true}
                    {aiContextPrompt}
                    {askAiContextPrompt}
                    filePath={effectiveTab.path ?? null}
                    scrollKey={editorScrollKey}
                    ownerTabId={effectiveTab.id}
                    onchange={handleInput}
                    class="h-full font-mono"
                />
            </div>
        {/if}
    </div>

    <!-- Embedded infoview panel (hidden when shown elsewhere in the layout) -->
    {#if !hideInfoview}
        <!-- Draggable splitter — cursor-following gradient highlight, matching
             the Julia editor's REPL divider for visual consistency. -->
        <div class="relative z-1 flex-none h-1.5 -mx-1 select-none">
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-label={$t("lean_editor.resize_infoview")}
                onpointerdown={startDrag}
                onpointermove={onDividerMove}
                onpointerenter={() => (dividerHovering = true)}
                onpointerleave={() => (dividerHovering = false)}
                ondblclick={() => (infoviewHeight = INFOVIEW_DEFAULT_HEIGHT)}
                title="Drag to resize · Double-click to reset"
                class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 cursor-row-resize"
            ></div>
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
        <div
            class="flex-none flex flex-col mx-2 mb-2 overflow-hidden rounded-md border border-brand-sand-200 dark:border-[#414559]"
            style:height="{infoviewHeight}px"
        >
            <LeanInfoviewPane
                runtime={leanEditorRuntime}
                getCode={currentCode}
                onJump={jumpTo}
            />
        </div>
    {/if}
</div>
