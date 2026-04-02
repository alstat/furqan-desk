<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { save } from "@tauri-apps/plugin-dialog";
    import { writeFile } from "@tauri-apps/plugin-fs";
    import { get } from "svelte/store";
    import { onDestroy } from "svelte";
    import {
        typstSource,
        typstRecompile,
        typstSvgPages,
        typstCompileError,
        typstIsCompiling,
        zenMode,
        zenPeek,
    } from "$lib/stores/editor.store";
    import { hideSurahPage } from "$lib/stores/quran.svelte";
    import {
        tabs,
        activeTab,
        setActiveTabContent,
        setTabContent,
    } from "$lib/stores/tabs.store";
    import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
    import {
        autocompletion,
        type CompletionSource,
    } from "@codemirror/autocomplete";
    import { TYPST_COMPLETIONS } from "$lib/completions/typst";

    let {
        tabId = null,
        inCrossHost = false,
    }: { tabId?: string | null; inCrossHost?: boolean } = $props();

    let effectiveTab = $derived(
        tabId ? ($tabs.find((t) => t.id === tabId) ?? null) : $activeTab,
    );

    // True when the preview is displayed in the Parchment area (side-by-side mode).
    // Suppressed when this editor is the host in a cross pair (shows inline preview instead).
    const sideBySide = $derived($hideSurahPage() && !inCrossHost);

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    // Keep typstSource in sync with effective tab content
    $effect(() => {
        if (effectiveTab?.type === "typst" || effectiveTab?.type === "text") {
            typstSource.set(effectiveTab.content);
        }
    });

    $effect(() => {
        void $typstRecompile;
        if (effectiveTab?.type !== "typst") {
            typstSvgPages.set([]);
            typstCompileError.set("");
            return;
        }
        const src = $typstSource;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => compileToSvg(src), 300);
        return () => clearTimeout(debounceTimer);
    });

    async function compileToSvg(src: string) {
        if (!src.trim()) {
            typstSvgPages.set([]);
            typstCompileError.set("");
            return;
        }
        typstIsCompiling.set(true);
        typstCompileError.set("");
        try {
            typstSvgPages.set(
                await invoke<string[]>("compile_typst_svg", { source: src }),
            );
        } catch (e) {
            typstCompileError.set(String(e));
            typstSvgPages.set([]);
        } finally {
            typstIsCompiling.set(false);
        }
    }

    async function exportPdf() {
        typstCompileError.set("");
        try {
            const bytes = await invoke<number[]>("compile_typst_pdf", {
                source: get(typstSource),
            });
            const path = await save({
                filters: [{ name: "PDF", extensions: ["pdf"] }],
            });
            if (path) await writeFile(path, new Uint8Array(bytes));
        } catch (e) {
            typstCompileError.set(String(e));
        }
    }

    function handleInput(newContent: string) {
        typstSource.set(newContent);
        if (tabId) setTabContent(tabId, newContent);
        else setActiveTabContent(newContent);
    }

    // ── Completion source ─────────────────────────────────────────────────────
    // Match after # (e.g. #pa → suggests page, pad, …) or plain identifiers.
    const typstCompletionSource: CompletionSource = (context) => {
        const hashMatch = context.matchBefore(/#[\w-]*/);
        const wordMatch = context.matchBefore(/[\w-]+/);

        if (hashMatch) {
            const prefix = hashMatch.text.slice(1).toLowerCase();
            const filtered = TYPST_COMPLETIONS.filter((c) =>
                c.label.toLowerCase().startsWith(prefix),
            );
            if (filtered.length === 0 && !context.explicit) return null;
            return {
                from: hashMatch.from + 1,
                options: filtered,
                validFor: /^[\w-]*$/,
            };
        }

        if (wordMatch && (wordMatch.to > wordMatch.from || context.explicit)) {
            const prefix = wordMatch.text.toLowerCase();
            const filtered = TYPST_COMPLETIONS.filter((c) =>
                c.label.toLowerCase().startsWith(prefix),
            );
            if (filtered.length === 0) return null;
            return {
                from: wordMatch.from,
                options: filtered,
                validFor: /^[\w-]*$/,
            };
        }

        return null;
    };

    const typstCompletionExtension = autocompletion({
        override: [typstCompletionSource],
    });

    const labelClass =
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300";

    let lineWrap = $state(true);

    // ── Resize (preview pane) ─────────────────────────────────────────────────
    let containerEl: HTMLDivElement;
    let previewHeight = $state(216); // 54 × 4px = 216px (replaces fixed h-54)
    let dragStartY = 0;
    let dragStartHeight = 0;

    function startDrag(e: PointerEvent) {
        dragStartY = e.clientY;
        dragStartHeight = previewHeight;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", stopDrag, { once: true });
    }
    function onDrag(e: PointerEvent) {
        const delta = dragStartY - e.clientY;
        const maxH = containerEl
            ? Math.max(120, containerEl.offsetHeight - 120 - 6)
            : dragStartHeight * 2;
        previewHeight = Math.max(120, Math.min(maxH, dragStartHeight + delta));
    }
    function stopDrag() {
        window.removeEventListener("pointermove", onDrag);
    }
    onDestroy(() => {
        window.removeEventListener("pointermove", onDrag);
    });
</script>

<div
    bind:this={containerEl}
    class="relative overflow-visible flex flex-col h-full"
>
    <!-- Editor — always visible -->
    <div class="flex-1 flex flex-col min-h-0">
        <div class="flex items-center justify-between px-2 pt-1 mb-1">
            <span
                class="text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300"
                >{effectiveTab?.name ?? "Editor"}</span
            >
            <button
                onclick={() => (lineWrap = !lineWrap)}
                title={lineWrap ? "Disable line wrap" : "Enable line wrap"}
                class="{$zenMode
                    ? ($zenPeek ? 'opacity-50 transition-opacity duration-200' : 'opacity-0 hover:opacity-100 transition-opacity duration-200')
                    : ''} flex cursor-pointer items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors
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
        <CodeMirrorEditor
            value={$typstSource}
            language="typst"
            extensions={[typstCompletionExtension]}
            {lineWrap}
            onchange={handleInput}
            class={`${effectiveTab?.type !== "typst" ? "mb-4" : ""} ${sideBySide ? "mb-3" : ""} flex-1 min-h-0 overflow-hidden border border-brand-sand-200 rounded-md mx-2 font-mono`}
        />
    </div>

    <!-- Splitter + resizable preview pane — hidden when preview is in Parchment area -->
    {#if effectiveTab?.type === "typst" && !sideBySide}
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
        <div
            class="flex-none flex flex-col p-2"
            style:height="{previewHeight}px"
        >
            <span class={labelClass}>Preview</span>
            <div class="default-scroll flex-1 overflow-auto min-h-0">
                {#if $typstIsCompiling}
                    <p class="text-xs text-brand-charcoal-300 italic">
                        Compiling…
                    </p>
                {:else if $typstCompileError}
                    <pre
                        class="text-xs text-red-500 whitespace-pre-wrap">{$typstCompileError}</pre>
                {:else if $typstSvgPages.length > 0}
                    <div class="flex flex-col gap-3 pb-2">
                        {#each $typstSvgPages as pageSvg}
                            <div
                                class="typst-page overflow-hidden border border-stone-200 rounded-md shadow-sm bg-white"
                            >
                                {@html pageSvg}
                            </div>
                        {/each}
                    </div>
                {:else}
                    <p class="text-xs text-brand-charcoal-300 italic">
                        Preview will appear here.
                    </p>
                {/if}
            </div>
        </div>
    {/if}

    <!-- Footer — always shown for .typ files -->
    {#if effectiveTab?.type === "typst" && !sideBySide}
        <div
            class="h-10 flex items-center justify-end px-3 border-t border-brand-sand-200 gap-2"
        >
            {#if $typstCompileError}
                <span class="text-xs text-red-500">Compile error</span>
            {/if}
            <button
                onclick={exportPdf}
                class="{$zenMode
                    ? 'opacity-25 hover:opacity-100'
                    : ''} mr-3 cursor-pointer px-3 py-1 text-xs font-semibold rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-500 dark:hover:bg-brand-gold-500 transition-colors"
            >
                Export PDF
            </button>
        </div>
    {/if}
</div>

<style>
    .typst-page :global(svg) {
        width: 100%;
        height: auto;
        display: block;
    }
</style>
