<script lang="ts">
    import { invoke } from '@tauri-apps/api/core';
    import { save } from '@tauri-apps/plugin-dialog';
    import { writeFile } from '@tauri-apps/plugin-fs';
    import { get } from 'svelte/store';
    import { typstSource, typstSvgPages, typstCompileError, typstIsCompiling } from '$lib/stores/editor.store';
    import Icon from '@iconify/svelte';

    async function exportPdf() {
        typstCompileError.set('');
        try {
            const bytes = await invoke<number[]>('compile_typst_pdf', { source: get(typstSource) });
            const path  = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }] });
            if (path) await writeFile(path, new Uint8Array(bytes));
        } catch (e) {
            typstCompileError.set(String(e));
        }
    }
</script>

<style>
    .typst-page :global(svg) {
        width: 100%;
        height: auto;
        display: block;
    }
</style>

<!-- Outer: matches Parchment's outer wrapper exactly -->
<div class="relative z-1 flex flex-col items-center bg-white sm:w-full md:w-9/12 lg:w-6/12 sm:shadow-xl sm:shadow-slate-200/60">

    <!-- Inner: matches Parchment's inner scrollable div (border + rounded-r-md) -->
    <div class="border border-stone-200 w-full flex-1 overflow-y-auto rounded-r-md flex flex-col min-h-0">

        <!-- Toolbar inside the border -->
        <div class="flex items-center justify-between px-4 py-2 border-b border-stone-200 shrink-0">
            <span class="text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300">
                {#if $typstIsCompiling}
                    <span class="flex items-center gap-1 text-brand-charcoal-300 italic">
                        <Icon icon="solar:refresh-bold" width="0.85rem" class="animate-spin" />
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
                class="cursor-pointer px-3 py-1 text-xs font-semibold rounded-full bg-brand-gold-400 text-white hover:bg-brand-gold-500 transition-colors"
            >
                Export PDF
            </button>
        </div>

        <!-- Pages -->
        <div class="flex-1 overflow-y-auto px-6 py-4">
            {#if $typstCompileError}
                <pre class="text-xs text-red-500 whitespace-pre-wrap">{$typstCompileError}</pre>
            {:else if $typstSvgPages.length > 0}
                <div class="flex flex-col gap-6">
                    {#each $typstSvgPages as pageSvg}
                        <div class="typst-page border border-brand-sand-300 rounded shadow-sm bg-white">
                            {@html pageSvg}
                        </div>
                    {/each}
                </div>
            {:else if !$typstIsCompiling}
                <p class="text-xs text-brand-charcoal-300 italic">Start typing in the editor to see a preview.</p>
            {/if}
        </div>

    </div>
</div>
