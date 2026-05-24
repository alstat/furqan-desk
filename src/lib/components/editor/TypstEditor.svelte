<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { save } from "@tauri-apps/plugin-dialog";
    import { writeFile } from "@tauri-apps/plugin-fs";
    import { get } from "svelte/store";
    import { onDestroy, tick } from "svelte";
    import Icon from "@iconify/svelte";
    import {
        typstSource,
        typstRecompile,
        typstSvgPages,
        typstCompileError,
        typstIsCompiling,
        zenMode,
        zenPeek,
        appDarkMode,
        typstPreviewDarkMode,
        editorIndentSize,
        codeMirrorViewInstance,
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
    import { t } from "$lib/i18n";

    let {
        tabId = null,
        inCrossHost = false,
    }: { tabId?: string | null; inCrossHost?: boolean } = $props();

    let effectiveTab = $derived(
        tabId ? ($tabs.find((t) => t.id === tabId) ?? null) : $activeTab,
    );
    let editorScrollKey = $derived(effectiveTab?.path ?? effectiveTab?.id ?? null);

    // True when the preview is displayed in the Parchment area (side-by-side mode).
    // Suppressed when this editor is the host in a cross pair (shows inline preview instead).
    const sideBySide = $derived($hideSurahPage() && !inCrossHost);

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let embeddedPreviewScrollEl: HTMLDivElement | null = $state(null);
    let currentEmbeddedPreviewPage = $state(1);
    let lastPreviewScrollTop = 0;

    function handlePreviewScroll(): void {
        if (embeddedPreviewScrollEl && embeddedPreviewScrollEl.scrollHeight > embeddedPreviewScrollEl.clientHeight) {
            lastPreviewScrollTop = embeddedPreviewScrollEl.scrollTop;
        }
        updateCurrentEmbeddedPreviewPage();
    }

    function updateCurrentEmbeddedPreviewPage(): void {
        if (!embeddedPreviewScrollEl || $typstSvgPages.length === 0) {
            currentEmbeddedPreviewPage = 1;
            return;
        }

        const containerRect = embeddedPreviewScrollEl.getBoundingClientRect();
        const viewportCenter = containerRect.top + containerRect.height / 2;
        const pages = Array.from(
            embeddedPreviewScrollEl.querySelectorAll<HTMLElement>(
                ".typst-page",
            ),
        );
        let nearestPage = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const [i, page] of pages.entries()) {
            const rect = page.getBoundingClientRect();
            const pageCenter = rect.top + rect.height / 2;
            const distance = Math.abs(pageCenter - viewportCenter);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPage = i;
            }
        }

        currentEmbeddedPreviewPage = nearestPage + 1;
    }

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

    $effect(() => {
        const pageCount = $typstSvgPages.length;
        if (pageCount === 0) {
            currentEmbeddedPreviewPage = 1;
            return;
        }

        tick().then(() => {
            if (embeddedPreviewScrollEl && lastPreviewScrollTop > 0) {
                const maxScroll =
                    embeddedPreviewScrollEl.scrollHeight -
                    embeddedPreviewScrollEl.clientHeight;
                if (maxScroll > 0) {
                    embeddedPreviewScrollEl.scrollTop = Math.min(
                        lastPreviewScrollTop,
                        maxScroll,
                    );
                }
            }
            updateCurrentEmbeddedPreviewPage();
        });
    });

    const IMPORT_RE = /#import\s+"@([\w-]+)\/([\w-]+):([\d.]+)"/g;

    async function ensurePackagesInstalled(source: string): Promise<void> {
        const imports: { namespace: string; name: string; version: string }[] =
            [];
        for (const m of source.matchAll(IMPORT_RE)) {
            imports.push({ namespace: m[1], name: m[2], version: m[3] });
        }
        if (imports.length === 0) return;

        const installed = await Promise.all(
            imports.map((p) => invoke<boolean>("check_typst_package", p)),
        );
        const missing = imports.filter((_, i) => !installed[i]);
        if (missing.length === 0) return;

        await Promise.all(
            missing.map((p) =>
                invoke("install_typst_package", p).catch((e) => {
                    throw new Error(
                        `Package install failed: @${p.namespace}/${p.name}:${p.version} — ${e}`,
                    );
                }),
            ),
        );
    }

    async function compileToSvg(src: string) {
        if (!src.trim()) {
            typstSvgPages.set([]);
            typstCompileError.set("");
            return;
        }
        typstIsCompiling.set(true);
        typstCompileError.set("");
        try {
            await ensurePackagesInstalled(src);
            typstSvgPages.set(
                await invoke<string[]>("compile_typst_svg", {
                    source: src,
                    path: effectiveTab?.path ?? null,
                }),
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
            const src = get(typstSource);
            await ensurePackagesInstalled(src);
            const bytes = await invoke<number[]>("compile_typst_pdf", {
                source: src,
                path: effectiveTab?.path ?? null,
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

    // ── Typst formatter ───────────────────────────────────────────────────────
    let formatting = $state(false);
    let formatError = $state("");
    let formatErrorTimer: ReturnType<typeof setTimeout> | null = null;

    function showFormatError(msg: string) {
        formatError = msg;
        if (formatErrorTimer) clearTimeout(formatErrorTimer);
        formatErrorTimer = setTimeout(() => (formatError = ""), 8000);
    }

    async function formatTypst() {
        const view = get(codeMirrorViewInstance);
        if (!view || formatting) return;
        const code = view.state.doc.toString();
        if (!code.trim()) return;
        formatting = true;
        formatError = "";
        try {
            const formatted = await invoke<string>("typst_format", {
                source: code,
                indent: get(editorIndentSize),
            });
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
        } catch (e) {
            showFormatError(typeof e === "string" ? e : String(e));
        } finally {
            formatting = false;
        }
    }

    const aiContextPrompt =
        "This text is part of a typst file, so your output should be formatted as part of a typst file";

    // ── Resize (preview pane) ─────────────────────────────────────────────────
    let containerEl: HTMLDivElement;
    let previewHeight = $state(200); // 54 × 4px = 216px (replaces fixed h-54)
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
        if (formatErrorTimer) clearTimeout(formatErrorTimer);
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
                >{effectiveTab?.name ??
                    $t("typst.fallback_name")}{#if effectiveTab?.isDirty}<span
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
                <!-- Typst Formatter -->
                <button
                    onclick={formatTypst}
                    disabled={formatting}
                    title={$t("typst.format_title")}
                    class="flex cursor-pointer items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors
                           bg-brand-gold-100 dark:bg-brand-gold-400/15 text-brand-gold-600 dark:text-brand-gold-400
                           hover:bg-brand-gold-200 dark:hover:bg-brand-gold-400/25
                           disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Icon icon="icon-park-twotone:format-brush" width="11" />
                    {formatting ? $t("typst.formatting") : $t("typst.format")}
                </button>
                <!-- Line wrap toggle -->
                <button
                    onclick={() => (lineWrap = !lineWrap)}
                    title={lineWrap ? $t("julia_cell.disable_wrap") : $t("julia_cell.enable_wrap")}
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
                    {lineWrap ? $t("julia_editor.wrap") : $t("julia_editor.no_wrap")}
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
        <CodeMirrorEditor
            value={$typstSource}
            language="typst"
            extensions={[typstCompletionExtension]}
            {lineWrap}
            aiSelectionTools={true}
            {aiContextPrompt}
            filePath={effectiveTab?.path ?? null}
            scrollKey={editorScrollKey}
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
            <span class={labelClass}>{$t("typst.preview")}</span>
            <div class="relative flex-1 min-h-0">
                {#if $typstSvgPages.length > 0}
                    <div
                        class="pointer-events-none absolute right-2 top-2 z-20 rounded-full px-2.5 py-1 text-[10px] font-semibold leading-none text-brand-charcoal-300 backdrop-blur-md"
                        aria-label={$t("typst.page_of").replace("{current}", String(currentEmbeddedPreviewPage)).replace("{total}", String($typstSvgPages.length))}
                    >
                        {currentEmbeddedPreviewPage} / {$typstSvgPages.length}
                    </div>
                {/if}
                <div
                    bind:this={embeddedPreviewScrollEl}
                    onscroll={handlePreviewScroll}
                    class="default-scroll h-full overflow-auto"
                >
                    {#if $typstIsCompiling}
                        <p class="text-xs text-brand-charcoal-300 italic">
                            {$t("typst.compiling")}
                        </p>
                    {:else if $typstCompileError}
                        <pre
                            class="text-xs text-red-500 whitespace-pre-wrap">{$typstCompileError}</pre>
                    {:else if $typstSvgPages.length > 0}
                        <div class="flex flex-col gap-3 pb-2">
                            {#each $typstSvgPages as pageSvg}
                                <div
                                    class="typst-page overflow-hidden border border-stone-200 dark:border-[#414559] rounded-md shadow-sm bg-white {$appDarkMode &&
                                    $typstPreviewDarkMode
                                        ? 'typst-page-dark'
                                        : ''}"
                                >
                                    {@html pageSvg}
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="text-xs text-brand-charcoal-300 italic">
                            {$t("typst.preview_placeholder")}
                        </p>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    <!-- Footer — always shown for .typ files -->
    {#if effectiveTab?.type === "typst" && !sideBySide}
        <div
            class="h-10 flex items-center justify-end px-3 border-t border-brand-sand-200 gap-2"
        >
            {#if $typstCompileError}
                <span class="text-xs text-red-500">{$t("typst.compile_error")}</span>
            {/if}
            <button
                onclick={exportPdf}
                class="{$zenMode
                    ? 'opacity-25 hover:opacity-100'
                    : ''} mr-3 cursor-pointer px-3 py-1 text-xs font-semibold rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-500 dark:hover:bg-brand-gold-500 transition-colors"
            >
                {$t("typst.export_pdf")}
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
    .typst-page-dark {
        background-color: #1f2430;
    }
    .typst-page-dark :global(svg) {
        filter: invert(1) hue-rotate(180deg);
    }
</style>
