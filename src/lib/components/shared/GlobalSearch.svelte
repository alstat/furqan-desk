<script lang="ts">
    import { fly } from "svelte/transition";
    import { onDestroy } from "svelte";
    import { readDir, readTextFile } from "@tauri-apps/plugin-fs";
    import Icon from "@iconify/svelte";
    import {
        openFolderPath,
        openOrFocusTab,
        isFlatFile,
    } from "$lib/stores/tabs.store";
    import { surahOrientation } from "$lib/stores/quran.svelte";

    let isRtl = $derived($surahOrientation() === "flex-row-reverse");
    import {
        codeMirrorViewInstance,
        zenMode,
        zenPeek,
    } from "$lib/stores/editor.store";
    import { get } from "svelte/store";
    import { EditorSelection } from "@codemirror/state";
    import { EditorView } from "@codemirror/view";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { t } from "$lib/i18n";
    import { IS_APPLE } from "@lexical/utils";
    import { bringToFront } from "$lib/stores/window-manager.store";

    // Share the global window-manager stack so the search panel raises above the
    // File Explorer (which uses the same counter). Raised on open and on click.
    let zIndex = $state(50);
    function focusPanel() {
        zIndex = bringToFront();
    }

    interface MatchLine {
        lineNumber: number;
        lineText: string;
        matchStart: number;
        matchEnd: number;
    }

    interface SearchResult {
        filePath: string;
        fileName: string;
        matches: MatchLine[];
    }

    let isOpen = $state(false);
    let query = $state("");
    let caseSensitive = $state(false);
    let useRegex = $state(false);
    let isSearching = $state(false);
    let results = $state<SearchResult[]>([]);
    let expandedFiles = $state<Set<string>>(new Set());

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Resizing. The panel keeps its default Tailwind size/position until the
    // first resize, then switches to explicit fixed positioning with width/height.
    // The n/w handles move the top-left corner, so resizing initialises `panelPos`.
    let panelEl = $state<HTMLElement | null>(null);
    const MIN_W = 240;
    const MIN_H = 200;
    let panelPos = $state<{ x: number; y: number } | null>(null);
    let panelSize = $state<{ w: number; h: number } | null>(null);

    type ResizeDir = { e: boolean; w: boolean; n: boolean; s: boolean };
    const resizeHandles: Array<{ cls: string; dir: ResizeDir }> = [
        { cls: "resize-n", dir: { n: true, s: false, e: false, w: false } },
        { cls: "resize-s", dir: { n: false, s: true, e: false, w: false } },
        { cls: "resize-e", dir: { n: false, s: false, e: true, w: false } },
        { cls: "resize-w", dir: { n: false, s: false, e: false, w: true } },
        { cls: "resize-ne", dir: { n: true, s: false, e: true, w: false } },
        { cls: "resize-se", dir: { n: false, s: true, e: true, w: false } },
        { cls: "resize-sw", dir: { n: false, s: true, e: false, w: true } },
        { cls: "resize-nw", dir: { n: true, s: false, e: false, w: true } },
    ];
    let _resizeDir: ResizeDir = { e: false, w: false, n: false, s: false };
    let _resizeStartX = 0,
        _resizeStartY = 0,
        _resizeStartW = 0,
        _resizeStartH = 0,
        _resizeStartPanelX = 0,
        _resizeStartPanelY = 0;

    function startResize(e: PointerEvent, dir: ResizeDir) {
        if (!panelEl) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = panelEl.getBoundingClientRect();
        if (!panelPos) panelPos = { x: rect.left, y: rect.top };
        if (!panelSize) panelSize = { w: rect.width, h: rect.height };
        _resizeDir = dir;
        _resizeStartX = e.clientX;
        _resizeStartY = e.clientY;
        _resizeStartW = panelSize.w;
        _resizeStartH = panelSize.h;
        _resizeStartPanelX = panelPos.x;
        _resizeStartPanelY = panelPos.y;
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", onResize);
        window.addEventListener("pointerup", stopResize, { once: true });
    }

    function onResize(e: PointerEvent) {
        if (!panelSize || !panelPos) return;
        const dx = e.clientX - _resizeStartX;
        const dy = e.clientY - _resizeStartY;
        let newW = _resizeStartW;
        let newH = _resizeStartH;
        let newX = _resizeStartPanelX;
        let newY = _resizeStartPanelY;
        if (_resizeDir.e) newW = Math.max(MIN_W, _resizeStartW + dx);
        if (_resizeDir.s) newH = Math.max(MIN_H, _resizeStartH + dy);
        if (_resizeDir.w) {
            newW = Math.max(MIN_W, _resizeStartW - dx);
            newX = _resizeStartPanelX + (_resizeStartW - newW);
        }
        if (_resizeDir.n) {
            newH = Math.max(MIN_H, _resizeStartH - dy);
            newY = _resizeStartPanelY + (_resizeStartH - newH);
        }
        panelSize = { w: newW, h: newH };
        panelPos = { x: newX, y: newY };
    }

    function stopResize() {
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onResize);
    }

    onDestroy(() => {
        window.removeEventListener("pointermove", onResize);
        document.body.style.userSelect = "";
    });

    // Global keyboard shortcut: Ctrl+Shift+F / Cmd+Shift+F
    function handleWindowKeydown(e: KeyboardEvent) {
        // Note: on macOS WebKit, Cmd suppresses Shift in e.key, so Cmd+Shift+F
        // arrives as "f" rather than "F" — compare case-insensitively.
        if (
            (e.ctrlKey || e.metaKey) &&
            e.shiftKey &&
            e.key.toLowerCase() === "f"
        ) {
            e.preventDefault();
            isOpen = !isOpen;
            if (isOpen) {
                // A fresh open returns to the default anchored position/size.
                panelPos = null;
                panelSize = null;
                focusPanel();
                // Focus the input on next tick
                setTimeout(() => {
                    document.getElementById("global-search-input")?.focus();
                }, 50);
            }
        }
        if (e.key === "Escape" && isOpen) {
            isOpen = false;
        }
    }

    async function collectFilePaths(folder: string): Promise<string[]> {
        const paths: string[] = [];
        async function walk(dir: string) {
            try {
                const entries = await readDir(dir);
                for (const entry of entries) {
                    if (!entry.name) continue;
                    const fullPath = `${dir}/${entry.name}`;
                    if (entry.isDirectory) {
                        await walk(fullPath);
                    } else if (isFlatFile(entry.name)) {
                        paths.push(fullPath);
                    }
                }
            } catch {
                // Permission denied or unreadable — skip
            }
        }
        await walk(folder);
        return paths;
    }

    async function runSearch(term: string) {
        const folder = get(openFolderPath);
        if (!folder || !term.trim()) {
            results = [];
            return;
        }
        isSearching = true;
        results = [];

        try {
            const paths = await collectFilePaths(folder);
            const found: SearchResult[] = [];

            let pattern: RegExp;
            try {
                if (useRegex) {
                    pattern = new RegExp(term, caseSensitive ? "g" : "gi");
                } else {
                    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    pattern = new RegExp(escaped, caseSensitive ? "g" : "gi");
                }
            } catch {
                // Invalid regex — stop search
                isSearching = false;
                return;
            }

            for (const filePath of paths) {
                try {
                    const content = await readTextFile(filePath);
                    const lines = content.split("\n");
                    const matches: MatchLine[] = [];

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        pattern.lastIndex = 0;
                        const match = pattern.exec(line);
                        if (match) {
                            matches.push({
                                lineNumber: i + 1,
                                lineText: line,
                                matchStart: match.index,
                                matchEnd: match.index + match[0].length,
                            });
                        }
                    }

                    if (matches.length > 0) {
                        const fileName = filePath.split("/").pop() ?? filePath;
                        found.push({ filePath, fileName, matches });
                    }
                } catch {
                    // Unreadable file — skip
                }
            }

            results = found;
            // Auto-expand all result groups
            expandedFiles = new Set(found.map((r) => r.filePath));
        } finally {
            isSearching = false;
        }
    }

    function scheduleSearch(term: string) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runSearch(term), 300);
    }

    $effect(() => {
        const term = query;
        scheduleSearch(term);
    });

    async function openMatch(result: SearchResult, match: MatchLine) {
        try {
            const content = await readTextFile(result.filePath);
            openOrFocusTab(result.filePath, content);
            // After tab switch, try to jump to the matching line in CodeMirror
            // Wait a tick for the editor to mount/restore
            setTimeout(() => {
                const view = get(codeMirrorViewInstance);
                if (!view) return;
                const doc = view.state.doc;
                if (match.lineNumber > doc.lines) return;
                const line = doc.line(match.lineNumber);
                const anchor = Math.min(line.from + match.matchStart, line.to);
                const head = Math.min(line.from + match.matchEnd, line.to);
                view.dispatch({
                    selection: EditorSelection.range(anchor, head),
                    effects: EditorView.scrollIntoView(anchor, { y: "center" }),
                });
                view.focus();
            }, 150);
        } catch {
            // File unreadable — ignore
        }
    }

    function toggleFile(filePath: string) {
        const next = new Set(expandedFiles);
        if (next.has(filePath)) {
            next.delete(filePath);
        } else {
            next.add(filePath);
        }
        expandedFiles = next;
    }

    let totalMatches = $derived(
        results.reduce((acc, r) => acc + r.matches.length, 0),
    );
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!-- Zen-mode locator dot — marks where the (hidden) Global Search button sits. -->
{#if $zenMode && !$zenPeek && !isOpen}
    <div
        aria-hidden="true"
        class="pointer-events-none absolute -left-5 top-1/2 z-2 h-8 w-8 flex items-center justify-center"
    >
        <span
            class="h-1.5 w-1.5 rounded-full bg-brand-charcoal-400 dark:bg-[#838ba7] opacity-15"
        ></span>
    </div>
{/if}

<!-- Global Search button — sits just outside the editor on the left, below the FileExplorer button -->
<button
    class="cursor-pointer absolute -left-5 top-1/2 z-3 rounded-full {actionBtnStyle} {isOpen
        ? 'bg-brand-gold-400 dark:bg-[#363a4f]'
        : ''} {$zenMode
        ? $zenPeek
            ? 'opacity-50 transition-opacity duration-200'
            : 'opacity-0 hover:opacity-100 transition-opacity duration-200'
        : ''}"
    onclick={() => {
        isOpen = !isOpen;
        if (isOpen) {
            panelPos = null;
            panelSize = null;
            focusPanel();
        }
    }}
    aria-label={IS_APPLE
        ? `${$t("search.global")} (⌘⇧F)`
        : `${$t("search.global")} (Ctrl+Shift+F)`}
    title={IS_APPLE
        ? `${$t("search.global")} (⌘⇧F)`
        : `${$t("search.global")} (Ctrl+Shift+F)`}
>
    <Icon icon="solar:magnifer-bold-duotone" class="h-4 w-4" />
</button>

<!-- Backdrop -->
{#if isOpen}
    <div
        role="presentation"
        class="fixed inset-0 z-10"
        onclick={() => (isOpen = false)}
        onkeydown={() => {}}
    ></div>
{/if}

<!-- Floating panel -->
{#if isOpen}
    <div
        bind:this={panelEl}
        role="presentation"
        onpointerdown={focusPanel}
        transition:fly={{ x: isRtl ? 8 : -8, duration: 180, opacity: 0 }}
        class="{panelPos
            ? 'fixed'
            : 'absolute top-1/2 left-5'} rounded-xl {panelSize
            ? ''
            : 'w-72 max-h-[50vh]'} bg-white dark:bg-[#292c3c]
		       border border-stone-200 dark:border-[#414559]
		       shadow-xl shadow-black/15 dark:shadow-black/40
		       flex flex-col overflow-hidden"
        style="z-index:{zIndex};{panelPos
            ? ` left:${panelPos.x}px; top:${panelPos.y}px;`
            : ''}{panelSize
            ? ` width:${panelSize.w}px; height:${panelSize.h}px;`
            : ''}"
    >
        <!-- Header -->
        <div
            class="shrink-0 px-5 py-2 border-b border-stone-200 dark:border-[#414559]
		            bg-brand-sand-50 dark:bg-[#232634] flex items-center justify-between gap-2"
        >
            <span
                class="text-[0.625rem] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
            >
                {$t("search.title")}
            </span>
            <!-- <button
                onclick={() => (isOpen = false)}
                aria-label="Close search"
                class="cursor-pointer text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-charcoal-500 dark:hover:text-[#c6d0f5] transition-colors"
            >
                <Icon icon="solar:close-circle-bold" width="0.85rem" />
            </button> -->
        </div>

        <!-- Search bar -->
        <div
            class="shrink-0 px-4 py-2 border-b border-stone-200 dark:border-[#414559] bg-white dark:bg-[#292c3c] flex items-center gap-1"
        >
            <div
                class="flex-1 flex items-center gap-1 rounded-xl border border-stone-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#1e2030] px-2 py-1"
            >
                <Icon
                    icon="solar:magnifer-bold-duotone"
                    class="shrink-0 text-brand-charcoal-300 dark:text-[#838ba7]"
                    width="0.75rem"
                />
                <input
                    id="global-search-input"
                    type="text"
                    placeholder={$t("search.placeholder")}
                    bind:value={query}
                    class="flex-1 bg-transparent text-[0.6875rem] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#838ba7] outline-none min-w-0"
                />
                {#if isSearching}
                    <Icon
                        icon="solar:refresh-bold-duotone"
                        class="shrink-0 text-brand-gold-400 dark:text-[#e5c890] animate-spin"
                        width="0.75rem"
                    />
                {/if}
            </div>
            <!-- Case sensitive toggle -->
            <button
                onclick={() => {
                    caseSensitive = !caseSensitive;
                    scheduleSearch(query);
                }}
                aria-pressed={caseSensitive}
                title={$t("search.case_sensitive")}
                class="cursor-pointer p-1.5 rounded-md text-[0.625rem] font-mono font-bold transition-colors
				       {caseSensitive
                    ? 'bg-brand-gold-400 dark:bg-brand-gold-600 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100'
                    : 'text-brand-charcoal-300 dark:text-[#838ba7] hover:bg-brand-sand-200 dark:hover:bg-[#363a4f]'}"
            >
                Aa
            </button>
            <!-- Regex toggle -->
            <button
                onclick={() => {
                    useRegex = !useRegex;
                    scheduleSearch(query);
                }}
                aria-pressed={useRegex}
                title={$t("search.use_regex")}
                class="cursor-pointer p-1.5 rounded-md text-[0.625rem] font-mono font-bold transition-colors
				       {useRegex
                    ? 'bg-brand-gold-400 dark:bg-brand-gold-600 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100'
                    : 'text-brand-charcoal-300 dark:text-[#838ba7] hover:bg-brand-sand-200 dark:hover:bg-[#363a4f]'}"
            >
                .*
            </button>
        </div>

        <!-- Results -->
        <div class="flex-1 min-h-0 overflow-y-auto bg-brand-sand-50 dark:bg-[#232634]">
            {#if !$openFolderPath}
                <div
                    class="px-3 py-4 text-center text-[0.6875rem] text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    <i>{$t("search.open_folder")}</i>
                </div>
            {:else if query.trim() === ""}
                <div
                    class="px-3 py-4 text-center text-[0.6875rem] text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    {$t("search.type_to_search")}
                </div>
            {:else if !isSearching && results.length === 0}
                <div
                    class="px-3 py-4 text-center text-[0.6875rem] text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    {$t("search.no_results")}
                </div>
            {:else}
                {#if results.length > 0}
                    <div
                        class="px-3 py-1.5 text-[0.625rem] text-brand-charcoal-300 dark:text-[#838ba7] border-b border-stone-100 dark:border-[#363a4f]"
                    >
                        {$t("search.result_count", {
                            count: totalMatches,
                            files: results.length,
                        })}
                    </div>
                {/if}
                {#each results as result}
                    <!-- File group header -->
                    <button
                        onclick={() => toggleFile(result.filePath)}
                        class="cursor-pointer w-full flex items-center gap-1.5 px-3 py-1.5 text-left
						       bg-brand-sand-50 dark:bg-[#232634] border-b border-stone-100 dark:border-[#363a4f]
						       hover:bg-brand-sand-100 dark:hover:bg-[#292c3c] transition-colors"
                    >
                        <Icon
                            icon={expandedFiles.has(result.filePath)
                                ? "solar:alt-arrow-down-bold"
                                : "solar:alt-arrow-right-bold"}
                            class="shrink-0 text-brand-charcoal-300 dark:text-[#838ba7]"
                            width="0.6rem"
                        />
                        <Icon
                            icon="solar:file-text-bold-duotone"
                            class="shrink-0 text-brand-gold-400 dark:text-[#e5c890]"
                            width="0.75rem"
                        />
                        <span
                            class="text-[0.8125rem] font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5] truncate flex-1"
                        >
                            {result.fileName}
                        </span>
                        <span
                            class="shrink-0 text-[0.625rem] text-brand-charcoal-300 dark:text-[#838ba7]"
                        >
                            {result.matches.length}
                        </span>
                    </button>

                    <!-- Match lines -->
                    {#if expandedFiles.has(result.filePath)}
                        {#each result.matches as match}
                            <button
                                onclick={() => openMatch(result, match)}
                                class="cursor-pointer w-full flex items-start gap-2 px-3 py-1 text-left
								       hover:bg-brand-sand-50 dark:hover:bg-[#1e2030] transition-colors border-b border-stone-50 dark:border-[#363a4f]/50"
                            >
                                <span
                                    class="shrink-0 text-[0.75rem] text-brand-charcoal-300 dark:text-[#838ba7] w-6 text-right mt-0.5 font-mono"
                                >
                                    {match.lineNumber}
                                </span>
                                <span
                                    class="text-[0.8125rem] text-brand-charcoal-500 dark:text-[#a5adce] font-mono truncate"
                                >
                                    {match.lineText.slice(
                                        0,
                                        match.matchStart,
                                    )}<mark
                                        class="bg-brand-gold-200 dark:bg-[#3b3757] text-brand-charcoal-900 dark:text-[#e5c890] rounded-sm not-italic"
                                        >{match.lineText.slice(
                                            match.matchStart,
                                            match.matchEnd,
                                        )}</mark
                                    >{match.lineText.slice(match.matchEnd)}
                                </span>
                            </button>
                        {/each}
                    {/if}
                {/each}
            {/if}
        </div>

        <!-- Resize handles -->
        {#each resizeHandles as { cls, dir }}
            <div
                aria-hidden="true"
                class="resize-handle {cls}"
                onpointerdown={(e) => startResize(e, dir)}
            ></div>
        {/each}
    </div>
{/if}

<style>
    mark {
        font-style: normal;
    }

    .resize-handle {
        position: absolute;
        z-index: 10;
    }
    .resize-n {
        top: 0;
        left: 10px;
        right: 10px;
        height: 6px;
        cursor: n-resize;
    }
    .resize-s {
        bottom: 0;
        left: 10px;
        right: 10px;
        height: 6px;
        cursor: s-resize;
    }
    .resize-e {
        top: 10px;
        right: 0;
        bottom: 10px;
        width: 6px;
        cursor: e-resize;
    }
    .resize-w {
        top: 10px;
        left: 0;
        bottom: 10px;
        width: 6px;
        cursor: w-resize;
    }
    .resize-ne {
        top: 0;
        right: 0;
        width: 14px;
        height: 14px;
        cursor: ne-resize;
    }
    .resize-se {
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
        cursor: se-resize;
    }
    .resize-sw {
        bottom: 0;
        left: 0;
        width: 14px;
        height: 14px;
        cursor: sw-resize;
    }
    .resize-nw {
        top: 0;
        left: 0;
        width: 14px;
        height: 14px;
        cursor: nw-resize;
    }
    .resize-se::before {
        content: "";
        position: absolute;
        bottom: 11px;
        right: 11px;
        width: 5px;
        height: 5px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.4);
        border-right: 1.5px solid rgba(130, 130, 130, 0.4);
        border-bottom-right-radius: 5px;
        pointer-events: none;
    }
    .resize-se::after {
        content: "";
        position: absolute;
        bottom: 7px;
        right: 7px;
        width: 9px;
        height: 9px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.55);
        border-right: 1.5px solid rgba(130, 130, 130, 0.55);
        border-bottom-right-radius: 9px;
        pointer-events: none;
    }
</style>
