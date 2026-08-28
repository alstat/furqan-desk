<script lang="ts">
    import { fly, fade } from "svelte/transition";
    import { tick } from "svelte";
    import { readDir, readTextFile } from "@tauri-apps/plugin-fs";
    import Icon from "@iconify/svelte";
    import { get } from "svelte/store";
    import {
        openFolderPath,
        openOrFocusTab,
        isFlatFile,
    } from "$lib/stores/tabs.store";
    import { IS_APPLE } from "@lexical/utils";

    interface FileItem {
        name: string;
        path: string;
        relPath: string;
    }

    interface ScoredItem {
        file: FileItem;
        score: number;
    }

    let isOpen = $state(false);
    let query = $state("");
    let files = $state<FileItem[]>([]);
    let isLoading = $state(false);
    let activeIndex = $state(0);
    let inputEl = $state<HTMLInputElement | null>(null);
    let listEl = $state<HTMLElement | null>(null);

    // Directories we never want to walk into — large and never user-editable.
    const SKIP_DIRS = new Set([
        "node_modules",
        ".git",
        "target",
        "dist",
        "build",
        ".svelte-kit",
        ".next",
    ]);

    // Recursively collect every editable (flat) file under the open folder, with
    // a path made relative to that folder for display + searching.
    async function collectFiles(folder: string): Promise<FileItem[]> {
        const base = folder.replace(/\/+$/, "");
        const items: FileItem[] = [];
        async function walk(dir: string) {
            let entries: Awaited<ReturnType<typeof readDir>>;
            try {
                entries = await readDir(dir);
            } catch {
                return; // permission denied / unreadable — skip
            }
            for (const entry of entries) {
                if (!entry.name) continue;
                const fullPath = `${dir}/${entry.name}`;
                if (entry.isDirectory) {
                    if (SKIP_DIRS.has(entry.name)) continue;
                    await walk(fullPath);
                } else if (isFlatFile(entry.name)) {
                    items.push({
                        name: entry.name,
                        path: fullPath,
                        relPath: fullPath.startsWith(`${base}/`)
                            ? fullPath.slice(base.length + 1)
                            : fullPath,
                    });
                }
            }
        }
        await walk(base);
        return items;
    }

    async function loadFiles() {
        const folder = get(openFolderPath);
        if (!folder) {
            files = [];
            return;
        }
        isLoading = true;
        try {
            files = await collectFiles(folder);
        } finally {
            isLoading = false;
        }
    }

    // Subsequence fuzzy match: every char of `q` must appear in order in `target`.
    // Returns a score (higher = better) or -1 when it doesn't match. Rewards
    // contiguous runs and matches at the start of a path segment / word.
    function fuzzyScore(q: string, target: string): number {
        const t = target.toLowerCase();
        let qi = 0;
        let score = 0;
        let lastMatch = -2;
        for (let ti = 0; ti < t.length && qi < q.length; ti++) {
            if (t[ti] === q[qi]) {
                if (lastMatch === ti - 1) score += 6; // contiguous run
                else score += 1;
                const prev = ti > 0 ? t[ti - 1] : "/";
                if (/[\/_\-. ]/.test(prev)) score += 4; // word/segment boundary
                lastMatch = ti;
                qi++;
            }
        }
        return qi === q.length ? score : -1;
    }

    let filtered = $derived.by<ScoredItem[]>(() => {
        const q = query.trim().toLowerCase();
        if (!q) {
            return files
                .slice()
                .sort((a, b) => a.relPath.localeCompare(b.relPath))
                .slice(0, 300)
                .map((file) => ({ file, score: 0 }));
        }
        const scored: ScoredItem[] = [];
        for (const file of files) {
            // Filename matches outrank path-only matches.
            const nameScore = fuzzyScore(q, file.name);
            if (nameScore >= 0) {
                scored.push({ file, score: nameScore + 1000 });
                continue;
            }
            const pathScore = fuzzyScore(q, file.relPath);
            if (pathScore >= 0) scored.push({ file, score: pathScore });
        }
        scored.sort(
            (a, b) =>
                b.score - a.score ||
                a.file.relPath.length - b.file.relPath.length,
        );
        return scored.slice(0, 300);
    });

    // Keep the selection in range whenever the result set changes.
    $effect(() => {
        filtered;
        if (activeIndex >= filtered.length) activeIndex = 0;
    });

    async function close() {
        isOpen = false;
        query = "";
        activeIndex = 0;
    }

    async function openPalette() {
        isOpen = true;
        query = "";
        activeIndex = 0;
        await tick();
        inputEl?.focus();
        loadFiles();
    }

    async function openSelected() {
        const item = filtered[activeIndex];
        if (!item) return;
        try {
            const content = await readTextFile(item.file.path);
            openOrFocusTab(item.file.path, content);
            close();
        } catch {
            // File became inaccessible — leave the palette open so the user can retry.
        }
    }

    function moveSelection(delta: number) {
        if (filtered.length === 0) return;
        activeIndex =
            (activeIndex + delta + filtered.length) % filtered.length;
        scrollActiveIntoView();
    }

    async function scrollActiveIntoView() {
        await tick();
        listEl
            ?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)
            ?.scrollIntoView({ block: "nearest" });
    }

    function handleWindowKeydown(e: KeyboardEvent) {
        const isToggle =
            (e.metaKey || e.ctrlKey) &&
            !e.shiftKey &&
            !e.altKey &&
            e.key.toLowerCase() === "p";
        if (isToggle) {
            e.preventDefault();
            if (isOpen) close();
            else openPalette();
        }
    }

    function handleInputKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            e.preventDefault();
            close();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            moveSelection(1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveSelection(-1);
        } else if (e.key === "Enter") {
            e.preventDefault();
            openSelected();
        }
    }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if isOpen}
    <!-- Backdrop -->
    <div
        role="presentation"
        transition:fade={{ duration: 120 }}
        class="fixed inset-0 z-[600] bg-black/20 dark:bg-black/40"
        onclick={close}
        onkeydown={() => {}}
    ></div>

    <!-- Centered palette -->
    <div
        transition:fly={{ y: -8, duration: 150, opacity: 0 }}
        class="fixed left-1/2 top-[12vh] z-[601] w-[34rem] max-w-[90vw] -translate-x-1/2
               rounded-2xl bg-white dark:bg-[#292c3c]
               border border-stone-200 dark:border-[#414559]
               shadow-2xl shadow-black/25 dark:shadow-black/50
               flex flex-col overflow-hidden"
    >
        <!-- Input row -->
        <div
            class="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-stone-200 dark:border-[#414559]"
        >
            <Icon
                icon="solar:magnifer-bold-duotone"
                class="shrink-0 text-brand-charcoal-300 dark:text-[#838ba7]"
                width="1rem"
            />
            <input
                bind:this={inputEl}
                bind:value={query}
                onkeydown={handleInputKeydown}
                type="text"
                placeholder="Go to file…"
                class="flex-1 bg-transparent text-[0.875rem] text-brand-charcoal-900 dark:text-[#c6d0f5]
                       placeholder-brand-charcoal-300 dark:placeholder-[#838ba7] outline-none min-w-0"
            />
            {#if isLoading}
                <Icon
                    icon="solar:refresh-bold-duotone"
                    class="shrink-0 text-brand-gold-400 dark:text-[#e5c890] animate-spin"
                    width="0.85rem"
                />
            {/if}
            <kbd
                class="shrink-0 text-[0.625rem] font-semibold text-brand-charcoal-300 dark:text-[#838ba7]
                       border border-stone-200 dark:border-[#414559] rounded px-1.5 py-0.5"
            >
                {IS_APPLE ? "⌘P" : "Ctrl+P"}
            </kbd>
        </div>

        <!-- Results -->
        <div bind:this={listEl} class="max-h-[50vh] overflow-y-auto py-1">
            {#if !$openFolderPath}
                <p
                    class="px-4 py-4 text-center text-[0.75rem] italic text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    Open a folder to browse files.
                </p>
            {:else if filtered.length === 0}
                <p
                    class="px-4 py-4 text-center text-[0.75rem] italic text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    {isLoading ? "Loading files…" : "No matching files."}
                </p>
            {:else}
                {#each filtered as item, i (item.file.path)}
                    {@const dir = item.file.relPath.includes("/")
                        ? item.file.relPath.slice(
                              0,
                              item.file.relPath.lastIndexOf("/"),
                          )
                        : ""}
                    <button
                        data-idx={i}
                        onclick={() => {
                            activeIndex = i;
                            openSelected();
                        }}
                        onmousemove={() => (activeIndex = i)}
                        class="cursor-pointer w-full flex items-center gap-2 px-4 py-1.5 text-left transition-colors
                               {i === activeIndex
                            ? 'bg-brand-sand-100 dark:bg-[#363a4f]'
                            : 'hover:bg-brand-sand-50 dark:hover:bg-[#1e2030]'}"
                    >
                        <Icon
                            icon="solar:file-text-bold-duotone"
                            class="shrink-0 text-brand-gold-500 dark:text-[#e5c890]"
                            width="0.95rem"
                        />
                        <span
                            class="shrink-0 text-[0.8125rem] text-brand-charcoal-700 dark:text-[#c6d0f5] font-medium truncate max-w-[16rem]"
                        >
                            {item.file.name}
                        </span>
                        {#if dir}
                            <span
                                class="text-[0.6875rem] text-brand-charcoal-300 dark:text-[#838ba7] font-mono truncate"
                            >
                                {dir}
                            </span>
                        {/if}
                    </button>
                {/each}
            {/if}
        </div>
    </div>
{/if}
