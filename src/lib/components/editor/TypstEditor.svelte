<script lang="ts">
    import { invoke } from '@tauri-apps/api/core';
    import { save } from '@tauri-apps/plugin-dialog';
    import { writeFile } from '@tauri-apps/plugin-fs';
    import { get } from 'svelte/store';
    import { typstSource, typstRecompile, typstSvgPages, typstCompileError, typstIsCompiling } from '$lib/stores/editor.store';
    import { hideSurahPage } from '$lib/stores/quran.svelte';

    // True when the preview is displayed in the Parchment area (side-by-side mode).
    // In that case we hide the inline preview here to avoid duplication.
    const sideBySide = $derived($hideSurahPage());

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    $effect(() => {
        void $typstRecompile;
        const src = $typstSource;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => compileToSvg(src), 300);
        return () => clearTimeout(debounceTimer);
    });

    async function compileToSvg(src: string) {
        if (!src.trim()) { typstSvgPages.set([]); typstCompileError.set(''); return; }
        typstIsCompiling.set(true);
        typstCompileError.set('');
        try {
            typstSvgPages.set(await invoke<string[]>('compile_typst_svg', { source: src }));
        } catch (e) {
            typstCompileError.set(String(e));
            typstSvgPages.set([]);
        } finally {
            typstIsCompiling.set(false);
        }
    }

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

    const labelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300';
</script>

<style>
    .typst-page :global(svg) {
        width: 100%;
        height: auto;
        display: block;
    }
</style>

<div class="flex flex-col h-full">
    <!-- Textarea — always visible -->
    <div class="flex-1 flex flex-col min-h-0">
        <span class="{labelClass} px-2 pt-2">Typst Source</span>
        <textarea
            bind:value={$typstSource}
            class="flex-1 resize-none font-mono text-sm bg-brand-sand-50 border border-brand-sand-200 rounded-md mx-2 p-2 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 focus:border-brand-gold-400"
            placeholder="#import &quot;@preview/ilm:1.4.2&quot;: *&#10;&#10;#show: ilm.with(title: [Title], author: &quot;Name&quot;)&#10;&#10;= Introduction&#10;&#10;This is *bold*."
            spellcheck="false"
        ></textarea>
    </div>

    <!-- Inline preview — only shown when NOT in side-by-side mode -->
    {#if !sideBySide}
    <div class="flex-none h-52 flex flex-col border-t border-brand-sand-200 p-2">
        <span class="{labelClass}">Preview</span>
        <div class="flex-1 overflow-auto min-h-0">
            {#if $typstIsCompiling}
                <p class="text-xs text-brand-charcoal-300 italic">Compiling…</p>
            {:else if $typstCompileError}
                <pre class="text-xs text-red-500 whitespace-pre-wrap">{$typstCompileError}</pre>
            {:else if $typstSvgPages.length > 0}
                <div class="flex flex-col gap-3 pb-2">
                    {#each $typstSvgPages as pageSvg}
                        <div class="typst-page border border-brand-sand-300 rounded shadow-sm bg-white">
                            {@html pageSvg}
                        </div>
                    {/each}
                </div>
            {:else}
                <p class="text-xs text-brand-charcoal-300 italic">Preview will appear here.</p>
            {/if}
        </div>
    </div>
    {/if}

    <!-- Footer — Export PDF hidden in side-by-side mode (TypstPreview has its own) -->
    {#if !sideBySide}
    <div class="h-10 flex items-center justify-end px-3 border-t border-brand-sand-200 gap-2">
        {#if $typstCompileError}
            <span class="text-xs text-red-500">Compile error</span>
        {/if}
        <button
            onclick={exportPdf}
            class="cursor-pointer px-3 py-1 text-xs font-semibold rounded-full bg-brand-gold-400 text-white hover:bg-brand-gold-500 transition-colors"
        >
            Export PDF
        </button>
    </div>
    {/if}
</div>
