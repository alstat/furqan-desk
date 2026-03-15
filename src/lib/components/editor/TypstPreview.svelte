<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { save } from "@tauri-apps/plugin-dialog";
    import { writeFile } from "@tauri-apps/plugin-fs";
    import { get } from "svelte/store";
    import {
        typstSource,
        typstSvgPages,
        typstCompileError,
        typstIsCompiling,
    } from "$lib/stores/editor.store";
    import Icon from "@iconify/svelte";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";

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

<!-- Outer: matches Parchment's outer wrapper exactly -->
<div
    class="relative z-1 flex flex-col items-center bg-white dark:bg-[#303446] sm:w-full md:w-9/12 lg:w-6/12 sm:shadow-xl sm:shadow-slate-200/60 dark:sm:shadow-black/30"
>
    <!-- Inner: matches Parchment's inner scrollable div (border + rounded-r-md) -->
    <div
        class="default-scroll border border-stone-200 dark:border-[#414559] w-full flex-1 overflow-y-auto rounded-r-md flex flex-col min-h-0"
    >
        <!-- Toolbar inside the border -->
        <div
            class="flex items-center justify-between px-4 py-1 border-b border-stone-200 dark:border-[#414559] shrink-0"
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
                        Compiling…
                    </span>
                {:else if $typstCompileError}
                    <span class="text-red-500">Compile error</span>
                {:else}
                    Preview
                {/if}
            </span>
            <button
                onclick={exportPdf}
                class={actionBtnStyle + " absolute -top-5 left-11/12"}
            >
                <Icon icon="ph:file-pdf-bold" />
            </button>
        </div>

        <!-- Pages -->
        <div class="default-scroll flex-1 overflow-y-auto px-6 pt-4 mb-7">
            {#if $typstCompileError}
                <pre
                    class="text-xs text-red-500 whitespace-pre-wrap">{$typstCompileError}</pre>
            {:else if $typstSvgPages.length > 0}
                <div class="flex flex-col gap-6">
                    {#each $typstSvgPages as pageSvg}
                        <div
                            class="typst-page overflow-hidden border border-stone-200 dark:border-[#414559] rounded-md shadow-sm bg-white"
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

<style>
    .typst-page :global(svg) {
        width: 100%;
        height: auto;
        display: block;
    }
</style>
