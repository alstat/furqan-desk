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
    } from "$lib/stores/editor.store";
    import Icon from "@iconify/svelte";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";

    let { embedded = false }: { embedded?: boolean } = $props();
    let previewScrollEl: HTMLDivElement | null = $state(null);
    let currentPreviewPage = $state(1);

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
        if (pageCount === 0) {
            currentPreviewPage = 1;
            return;
        }

        tick().then(updateCurrentPreviewPage);
    });

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
</script>

<!-- Outer: matches Parchment's outer wrapper exactly; stripped when embedded in a split panel -->
<div
    class={embedded
        ? "flex-1 flex flex-col min-h-0 w-full"
        : ($zenMode
              ? ""
              : "sm:shadow-xl sm:shadow-slate-200/60 dark:sm:shadow-black/30 bg-white dark:bg-[#303446]") +
          " relative z-1 flex flex-col items-center rounded-r-md sm:w-full md:w-9/12 lg:w-6/12"}
>
    <!-- Inner: matches Parchment's inner scrollable div (border + rounded-r-md) -->
    <div
        class="{$zenMode
            ? ''
            : 'border border-stone-200 dark:border-[#414559]'} default-scroll w-full flex-1 overflow-y-auto rounded-r-md flex flex-col min-h-0"
    >
        <!-- Toolbar inside the border -->
        <div
            class="{$zenMode
                ? ''
                : 'border-b border-stone-200 dark:border-[#414559]'} flex items-center justify-between px-4 py-1 shrink-0"
        >
            <button
                onclick={exportPdf}
                class={$zenMode
                    ? actionBtnStyle +
                      ($zenPeek
                          ? " absolute top-1 left-11/12 opacity-50 transition-opacity duration-200"
                          : " absolute top-1 left-11/12 opacity-0 hover:opacity-100 transition-opacity duration-200")
                    : actionBtnStyle + " absolute top-1 left-11/12"}
            >
                <Icon icon="ph:file-pdf-bold" />
            </button>
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
                        Compiling…
                    </span>
                {:else if $typstCompileError}
                    <span class="text-red-500">Compile error</span>
                {:else}
                    Preview
                {/if}
            </span>
        </div>

        <!-- Pages -->
        <div class="relative flex-1 min-h-0 mb-7">
            {#if $typstSvgPages.length > 0}
                <div
                    class="pointer-events-none absolute right-8 top-2 z-20 rounded-full px-2.5 py-1 text-[10px] font-semibold leading-none text-brand-charcoal-300 backdrop-blur-md"
                    aria-label="Page {currentPreviewPage} of {$typstSvgPages.length}"
                >
                    {currentPreviewPage} / {$typstSvgPages.length}
                </div>
            {/if}
            <div
                bind:this={previewScrollEl}
                onscroll={updateCurrentPreviewPage}
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
                        Start typing in the editor to see a preview.
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
    .typst-page-dark {
        background-color: #1f2430;
    }
    .typst-page-dark :global(svg) {
        filter: invert(1) hue-rotate(180deg);
    }
</style>
