<script lang="ts">
    import { fly } from "svelte/transition";
    import { readDir, readTextFile } from "@tauri-apps/plugin-fs";
    import Icon from "@iconify/svelte";
    import {
        openFolderPath,
        openOrFocusTab,
        isFlatFile,
    } from "$lib/stores/tabs.store";
    import { codeMirrorViewInstance } from "$lib/stores/editor.store";
    import { get } from "svelte/store";
    import { EditorSelection } from "@codemirror/state";
    import { EditorView } from "@codemirror/view";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";

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

    // Global keyboard shortcut: Ctrl+Shift+F / Cmd+Shift+F
    function handleWindowKeydown(e: KeyboardEvent) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
            e.preventDefault();
            isOpen = !isOpen;
            if (isOpen) {
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

<!-- Global Search button — sits just outside the editor on the left, below the FileExplorer button -->
<button
    class="cursor-pointer absolute -left-5 top-1/2 z-3 rounded-full {actionBtnStyle} {isOpen
        ? 'bg-brand-gold-400 dark:bg-[#363a4f]'
        : ''}"
    onclick={() => {
        isOpen = !isOpen;
    }}
    aria-label="Global Search (Ctrl+Shift+F)"
    title="Global Search (Ctrl+Shift+F)"
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
        transition:fly={{ x: -8, duration: 180, opacity: 0 }}
        class="absolute top-1/2 left-1.5 ml-2 z-50 rounded-lg w-72 max-h-[50vh] bg-white dark:bg-[#292c3c]
		       border border-stone-200 dark:border-[#414559]
		       shadow-xl shadow-slate-200/60 dark:shadow-black/40
		       flex flex-col overflow-hidden"
    >
        <!-- Header -->
        <div
            class="shrink-0 px-3 py-2 border-b border-stone-200 dark:border-[#414559]
		            bg-brand-sand-50 dark:bg-[#232634] flex items-center justify-between gap-2"
        >
            <span
                class="text-[10px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
            >
                Search in Folder
            </span>
            <button
                onclick={() => (isOpen = false)}
                aria-label="Close search"
                class="cursor-pointer text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-charcoal-500 dark:hover:text-[#c6d0f5] transition-colors"
            >
                <Icon icon="solar:close-circle-bold" width="0.85rem" />
            </button>
        </div>

        <!-- Search bar -->
        <div
            class="shrink-0 px-2 py-2 border-b border-stone-200 dark:border-[#414559] bg-white dark:bg-[#292c3c] flex items-center gap-1"
        >
            <div
                class="flex-1 flex items-center gap-1 rounded-lg border border-stone-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#1e2030] px-2 py-1"
            >
                <Icon
                    icon="solar:magnifer-bold-duotone"
                    class="shrink-0 text-brand-charcoal-300 dark:text-[#838ba7]"
                    width="0.75rem"
                />
                <input
                    id="global-search-input"
                    type="text"
                    placeholder="Search…"
                    bind:value={query}
                    class="flex-1 bg-transparent text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#838ba7] outline-none min-w-0"
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
                title="Case sensitive"
                class="cursor-pointer p-1.5 rounded-md text-[10px] font-mono font-bold transition-colors
				       {caseSensitive
                    ? 'bg-brand-gold-400 dark:bg-brand-gold-600 text-white'
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
                title="Use regular expression"
                class="cursor-pointer p-1.5 rounded-md text-[10px] font-mono font-bold transition-colors
				       {useRegex
                    ? 'bg-brand-gold-400 dark:bg-brand-gold-600 text-white'
                    : 'text-brand-charcoal-300 dark:text-[#838ba7] hover:bg-brand-sand-200 dark:hover:bg-[#363a4f]'}"
            >
                .*
            </button>
        </div>

        <!-- Results -->
        <div class="flex-1 overflow-y-auto">
            {#if !$openFolderPath}
                <div
                    class="px-3 py-4 text-center text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    <i>Open a folder to search files</i>
                </div>
            {:else if query.trim() === ""}
                <div
                    class="px-3 py-4 text-center text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    Type to search…
                </div>
            {:else if !isSearching && results.length === 0}
                <div
                    class="px-3 py-4 text-center text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    No results found
                </div>
            {:else}
                {#if results.length > 0}
                    <div
                        class="px-3 py-1.5 text-[10px] text-brand-charcoal-300 dark:text-[#838ba7] border-b border-stone-100 dark:border-[#363a4f]"
                    >
                        {totalMatches} result{totalMatches === 1 ? "" : "s"} in {results.length}
                        file{results.length === 1 ? "" : "s"}
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
                            class="text-[11px] font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5] truncate flex-1"
                        >
                            {result.fileName}
                        </span>
                        <span
                            class="shrink-0 text-[10px] text-brand-charcoal-300 dark:text-[#838ba7]"
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
                                    class="shrink-0 text-[10px] text-brand-charcoal-300 dark:text-[#838ba7] w-6 text-right mt-0.5 font-mono"
                                >
                                    {match.lineNumber}
                                </span>
                                <span
                                    class="text-[11px] text-brand-charcoal-500 dark:text-[#a5adce] font-mono truncate"
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
    </div>
{/if}

<style>
    mark {
        font-style: normal;
    }
</style>
