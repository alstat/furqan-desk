<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { save } from "@tauri-apps/plugin-dialog";
    import { writeFile } from "@tauri-apps/plugin-fs";
    import { get } from "svelte/store";
    import { tick } from "svelte";
    import {
        typstSource,
        typstSvgPages,
        typstCompileError,
        typstIsCompiling,
        zenMode,
        zenPeek,
        appDarkMode,
        typstPreviewDarkMode,
        typstPreviewPath,
    } from "$lib/stores/editor.store";
    import { activeTab } from "$lib/stores/tabs.store";
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import TypstPreviewSourceSelector from "./TypstPreviewSourceSelector.svelte";

    // noTopBorder: drop the preview's top border when it sits below another pane
    // (e.g. the third editor in a three-file Typst split), so the seam isn't doubled.
    let {
        embedded = false,
        noTopBorder = false,
    }: { embedded?: boolean; noTopBorder?: boolean } = $props();
    let previewScrollEl: HTMLDivElement | null = $state(null);
    let currentPreviewPage = $state(1);

    // Per-tab preview-scroll memory shared across remounts of this component
    // (cross-type tab switches unmount the preview). Lives on globalThis so
    // the map survives Svelte's HMR.
    type ScrollMap = Map<string, number>;
    const PREVIEW_SCROLL_BY_KEY: ScrollMap = (() => {
        const g = globalThis as unknown as {
            __typstPreviewScrollByKey?: ScrollMap;
        };
        if (g.__typstPreviewScrollByKey instanceof Map)
            return g.__typstPreviewScrollByKey;
        const m: ScrollMap = new Map();
        g.__typstPreviewScrollByKey = m;
        return m;
    })();
    let scrollKey = $derived(
        $activeTab ? ($activeTab.path ?? $activeTab.id) : null,
    );

    function handlePreviewScroll(): void {
        if (
            scrollKey &&
            previewScrollEl &&
            previewScrollEl.isConnected &&
            previewScrollEl.scrollHeight > previewScrollEl.clientHeight
        ) {
            PREVIEW_SCROLL_BY_KEY.set(scrollKey, previewScrollEl.scrollTop);
        }
        updateCurrentPreviewPage();
    }

    function updateCurrentPreviewPage(): void {
        if (!previewScrollEl || $typstSvgPages.length === 0) {
            currentPreviewPage = 1;
            return;
        }

        const containerRect = previewScrollEl.getBoundingClientRect();
        const viewportCenter = containerRect.top + containerRect.height / 2;
        const pages = Array.from(
            previewScrollEl.querySelectorAll<HTMLElement>(".typst-page"),
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

        currentPreviewPage = nearestPage + 1;
    }

    $effect(() => {
        const pageCount = $typstSvgPages.length;
        const key = scrollKey;
        if (pageCount === 0) {
            currentPreviewPage = 1;
            return;
        }

        tick().then(() => {
            if (previewScrollEl && key) {
                const target = PREVIEW_SCROLL_BY_KEY.get(key) ?? 0;
                const maxScroll =
                    previewScrollEl.scrollHeight - previewScrollEl.clientHeight;
                if (maxScroll > 0) {
                    previewScrollEl.scrollTop = Math.min(target, maxScroll);
                }
            }
            updateCurrentPreviewPage();
        });
    });

    async function exportPdf() {
        typstCompileError.set("");
        try {
            const bytes = await invoke<number[]>("compile_typst_pdf", {
                source: get(typstSource),
                path: get(typstPreviewPath),
            });
            const path = await save({
                filters: [{ name: "PDF", extensions: ["pdf"] }],
            });
            if (path) await writeFile(path, new Uint8Array(bytes));
        } catch (e) {
            typstCompileError.set(String(e));
        }
    }
</script>

<!-- Outer: matches Parchment's outer wrapper exactly; stripped when embedded in a split panel -->
<div
    class={embedded
        ? "relative flex-1 flex flex-col min-h-0 w-full"
        : ($zenMode
              ? ""
              : "sm:shadow-xl sm:shadow-slate-200/60 dark:sm:shadow-black/30 bg-white dark:bg-[#303446]") +
          " relative z-1 flex flex-col items-center rounded-r-md sm:w-full md:w-9/12 lg:w-6/12"}
>
    <!-- Inner: matches Parchment's inner scrollable div (border + rounded-r-md) -->
    <div
        class="{$zenMode
            ? ''
            : 'border border-stone-200 dark:border-[#414559]' +
              (noTopBorder
                  ? ' border-t-0'
                  : '')} default-scroll w-full flex-1 overflow-y-auto {noTopBorder
            ? 'rounded-br-md'
            : 'rounded-r-md'} flex flex-col min-h-0"
    >
        <!-- Toolbar inside the border -->
        <div
            class="{$zenMode
                ? ''
                : 'border-b border-stone-200 dark:border-[#414559]'} flex items-center justify-between px-4 py-1 shrink-0"
        >
            <span
                class="text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300"
            >
                {#if $typstIsCompiling}
                    <span
                        class="flex items-center gap-1 text-brand-charcoal-300 italic"
                    >
                        <Icon
                            icon="solar:refresh-bold"
                            width="0.85rem"
                            class="animate-spin"
                        />
                        {$t("typst.compiling")}
                    </span>
                {:else if $typstCompileError}
                    <span class="text-red-500">{$t("typst.compile_error")}</span
                    >
                {:else}
                    {$t("typst.preview")}
                {/if}
            </span>
            <div class="flex items-center gap-1.5">
                <button
                    onclick={exportPdf}
                    title={$t("typst.export_pdf")}
                    class="flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors
                           bg-brand-gold-100 dark:bg-brand-gold-400/15 text-brand-gold-600 dark:text-brand-gold-400
                           hover:bg-brand-gold-200 dark:hover:bg-brand-gold-400/25
                           {$zenMode
                        ? $zenPeek
                            ? 'opacity-50 transition-opacity duration-200'
                            : 'opacity-0 hover:opacity-100 transition-opacity duration-200'
                        : ''}"
                >
                    <Icon icon="ph:file-pdf-bold" width="11" />
                    {$t("typst.export_pdf")}
                </button>
                <TypstPreviewSourceSelector />
            </div>
        </div>

        <!-- Pages -->
        <div class="relative flex-1 min-h-0 mb-7">
            {#if $typstSvgPages.length > 0}
                <div
                    class="pointer-events-none absolute right-8 top-2 z-20 rounded-full px-2.5 py-1 text-[10px] font-semibold leading-none text-brand-charcoal-300 backdrop-blur-md"
                    aria-label={$t("typst.page_of")
                        .replace("{current}", String(currentPreviewPage))
                        .replace("{total}", String($typstSvgPages.length))}
                >
                    {currentPreviewPage} / {$typstSvgPages.length}
                </div>
            {/if}
            <div
                bind:this={previewScrollEl}
                onscroll={handlePreviewScroll}
                class={$zenMode
                    ? "default-scroll h-full overflow-y-auto px-6"
                    : "default-scroll h-full overflow-y-auto px-6 pt-4"}
            >
                {#if $typstCompileError}
                    <pre
                        class="text-xs text-red-500 whitespace-pre-wrap">{$typstCompileError}</pre>
                {:else if $typstSvgPages.length > 0}
                    <div class="flex flex-col gap-6">
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
                {:else if !$typstIsCompiling}
                    <p class="text-xs text-brand-charcoal-300 italic">
                        {$t("typst.preview_start_typing")}
                    </p>
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    .typst-page :global(svg) {
        width: 100%;
        height: auto;
        display: block;
    }
    /* Transparent, selectable text layer sits on top of the rendered glyphs so
       text can be highlighted and copied. */
    .typst-page :global(.typst-text-layer) {
        user-select: text;
    }
    .typst-page :global(.typst-text-layer text) {
        cursor: text;
    }
    .typst-page-dark {
        background-color: #1f2430;
    }
    .typst-page-dark :global(svg) {
        filter: invert(1) hue-rotate(180deg);
    }
    /* Keep the (transparent) text layer out of the dark-mode invert filter so
       the selection highlight keeps its normal color. */
    .typst-page-dark :global(.typst-text-layer) {
        filter: none;
    }
</style>
