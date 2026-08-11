<script lang="ts">
    import { untrack } from "svelte";
    import { appDarkMode, typstPreviewDarkMode } from "$lib/stores/editor.store";

    // Rendered page list for the Typst preview, shared by the side-by-side
    // preview (TypstPreview) and the editor's inline preview (TypstEditor).
    //
    // Every page typst emits is a full SVG — thousands of glyph <path>s plus a
    // transparent text layer for selection — so a 30-page document is many
    // megabytes of markup. Injecting all of it at once is what made switching
    // to a .typ tab (which remounts the preview) stall for seconds: the webview
    // has to parse, lay out and paint the entire document before it can respond.
    //
    // So only pages near the viewport keep their SVG in the DOM. Every page is
    // always present as a wrapper sized from the page's own viewBox, which
    // keeps scroll height, page numbering and scroll restoration exact — the
    // placeholder occupies precisely the space the real page will take.

    let {
        pages,
        zoom,
        scroller = null,
        gapClass = "gap-6",
        listClass = "",
    }: {
        pages: string[];
        zoom: number;
        /** The scrolling ancestor; used as the IntersectionObserver root. */
        scroller?: HTMLElement | null;
        gapClass?: string;
        listClass?: string;
    } = $props();

    const VIEWBOX_RE = /viewBox="0 0 ([\d.]+) ([\d.]+)"/;
    // A4 portrait, used only if a page somehow carries no viewBox.
    const FALLBACK_ASPECT = "1 / 1.4142";

    function aspectOf(svg: string): string {
        const m = VIEWBOX_RE.exec(svg);
        return m ? `${m[1]} / ${m[2]}` : FALLBACK_ASPECT;
    }

    // Cheap: matches within the first few hundred characters of each page.
    let aspects = $derived(pages.map(aspectOf));

    let shown = $state<boolean[]>([]);

    $effect(() => {
        // Track the page count without dropping what is already on screen — a
        // recompile of the same document reuses the same indices, so pages the
        // reader is looking at must not flash out and back in. Only the count
        // is a dependency: `shown` is read and written here, and the observer
        // writes it constantly while scrolling.
        const n = pages.length;
        untrack(() => {
            if (shown.length === n) return;
            const next: boolean[] = new Array(n).fill(false);
            for (let i = 0; i < Math.min(shown.length, n); i++)
                next[i] = shown[i];
            // A freshly opened document has nothing observed yet; show the
            // first page right away so the preview is never momentarily blank.
            if (shown.length === 0 && n > 0) next[0] = true;
            shown = next;
        });
    });

    // ── Viewport tracking ────────────────────────────────────────────────────
    const pageIndex = new WeakMap<HTMLElement, number>();
    const observed = new Set<HTMLElement>();
    let io: IntersectionObserver | null = null;

    $effect(() => {
        const root = scroller;
        if (!root) return;
        const obs = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const i = pageIndex.get(entry.target as HTMLElement);
                    if (i !== undefined) shown[i] = entry.isIntersecting;
                }
            },
            // A full viewport of slack above and below: pages are ready before
            // they scroll into view, and released once well past it.
            { root, rootMargin: "100% 0px" },
        );
        io = obs;
        for (const el of observed) obs.observe(el);
        return () => {
            obs.disconnect();
            if (io === obs) io = null;
        };
    });

    function observePage(node: HTMLElement, index: number) {
        pageIndex.set(node, index);
        observed.add(node);
        io?.observe(node);
        return {
            update(next: number) {
                pageIndex.set(node, next);
            },
            destroy() {
                io?.unobserve(node);
                observed.delete(node);
                pageIndex.delete(node);
            },
        };
    }

    let darkPages = $derived($appDarkMode && $typstPreviewDarkMode);
</script>

<div
    class="flex flex-col {gapClass} mx-auto {listClass}"
    style:width="{zoom * 100}%"
>
    {#each pages as pageSvg, i}
        <div
            use:observePage={i}
            class="typst-page overflow-hidden border border-stone-200 dark:border-[#414559] rounded-md shadow-sm bg-white {darkPages
                ? 'typst-page-dark'
                : ''}"
        >
            {#if shown[i]}
                {@html pageSvg}
            {:else}
                <div class="w-full" style:aspect-ratio={aspects[i]}></div>
            {/if}
        </div>
    {/each}
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
