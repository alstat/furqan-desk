<script lang="ts">
    import Icon from '@iconify/svelte';
    import NextPrevButton from "./NextPrevButton.svelte";
    import ParchmentActionBar from "./ParchmentActionBar.svelte";
    import BookmarkDialog from "./BookmarkDialog.svelte";
    import HighlightDialog from "./HighlightDialog.svelte";
    import {
        hideSurahPage,
        isSidebar,
        selectedSurahIdx,
    } from "$lib/stores/quran.svelte";
    import { morphFontSize } from "$lib/stores/morphology.store";
    import MorphologyView from "./MorphologyView.svelte";
    import { addHighlight } from "$lib/functions/bookmarks";
    import { pendingJumpAyah } from "$lib/stores/bookmarks.store";

    let scrollContainer = $state<HTMLElement | null>(null);
    let showBookmarks  = $state(false);
    let showHighlights = $state(false);

    $effect(() => {
        $selectedSurahIdx; // track changes
        scrollContainer?.scrollTo({ top: 0, behavior: "instant" });
    });

    // Jump to ayah when pendingJumpAyah is set
    $effect(() => {
        const target = $pendingJumpAyah;
        if (target === null || !scrollContainer) return;
        pendingJumpAyah.set(null);
        setTimeout(() => {
            const anchor = scrollContainer?.querySelector(`#ayah-${target}`);
            anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Soft highlight on all words + the verse number of the target ayah
            const words = scrollContainer?.querySelectorAll<HTMLElement>(
                `[data-ayah="${target}"], #ayah-${target}`
            );
            words?.forEach(el => {
                el.classList.remove('ayah-highlight');
                // force reflow so re-triggering works if same ayah is jumped to twice
                void el.offsetWidth;
                el.classList.add('ayah-highlight');
            });
            setTimeout(() => {
                words?.forEach(el => el.classList.remove('ayah-highlight'));
            }, 2500);
        }, 800);
    });

    // Text selection / highlight state
    interface SelectionInfo { text: string; surah: number; ayah: number; x: number; y: number; }
    let selectionInfo = $state<SelectionInfo | null>(null);
    let savingHighlight = $state(false);

    function handleMouseUp(event: MouseEvent) {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) { selectionInfo = null; return; }

        const text = selection.toString().trim();
        if (!text) { selectionInfo = null; return; }

        // Use startContainer — commonAncestorContainer is the parent div for multi-word selections
        const range = selection.getRangeAt(0);
        const startNode = range.startContainer;
        const el = startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode as HTMLElement;
        const wordEl = el?.closest('[data-ayah]') as HTMLElement | null;

        if (!wordEl) { selectionInfo = null; return; }

        const surah = parseInt(wordEl.dataset.surah ?? '0');
        const ayah = parseInt(wordEl.dataset.ayah ?? '0');

        if (!surah || !ayah) { selectionInfo = null; return; }

        selectionInfo = { text, surah, ayah, x: event.clientX, y: event.clientY };
    }

    async function saveHighlight() {
        if (!selectionInfo) return;
        savingHighlight = true;
        try {
            await addHighlight(selectionInfo.surah, selectionInfo.ayah, selectionInfo.text);
            window.getSelection()?.removeAllRanges();
            selectionInfo = null;
        } finally {
            savingHighlight = false;
        }
    }
</script>

<div
    class={`${$hideSurahPage() ? "hidden " : ""}relative z-1 flex flex-col items-center bg-white dark:bg-[#303446] sm:w-full md:w-9/12 lg:w-6/12 sm:shadow-xl sm:shadow-slate-200/60 dark:sm:shadow-black/30`}
>
    <ParchmentActionBar
        onOpenBookmarks={() => (showBookmarks = true)}
        onOpenHighlights={() => (showHighlights = true)}
    />

    <div
        bind:this={scrollContainer}
        role="document"
        onmouseup={handleMouseUp}
        class={`default-scroll border border-stone-200 dark:border-[#414559] w-full flex-1 overflow-y-auto px-12 py-10 text-right ${$morphFontSize} leading-loose text-slate-600 dark:text-[#c6d0f5] ${$isSidebar ? "rounded-r-md" : "rounded-md"}`}
    >
        <MorphologyView />
    </div>

    <NextPrevButton position={"absolute -bottom-4 inset-x-0 z-20"} />
</div>

<!-- Dialogs — rendered outside the z-1 stacking context so their fixed backdrop covers the full viewport -->
<BookmarkDialog  open={showBookmarks}  onClose={() => (showBookmarks  = false)} />
<HighlightDialog open={showHighlights} onClose={() => (showHighlights = false)} />

<!-- Floating Save Highlight button -->
{#if selectionInfo}
    <div
        class="fixed z-40 flex items-center gap-1.5 rounded-lg border border-lime-200 dark:border-[#a6d189]/40 bg-white dark:bg-[#414559] px-3 py-1.5 shadow-lg"
        style="left: {selectionInfo.x}px; top: {selectionInfo.y - 48}px; transform: translateX(-50%);"
    >
        <Icon icon="solar:magic-stick-3-bold-duotone" class="shrink-0 text-lime-600" width="0.9rem" />
        <button
            onclick={saveHighlight}
            disabled={savingHighlight}
            class="cursor-pointer text-xs font-medium text-slate-700 dark:text-[#c6d0f5] hover:text-lime-700 dark:hover:text-[#a6d189] disabled:opacity-50 transition-colors"
        >
            {savingHighlight ? 'Saving…' : 'Save Highlight'}
        </button>
        <button
            onclick={() => (selectionInfo = null)}
            aria-label="Dismiss"
            class="cursor-pointer ml-0.5 text-slate-400 dark:text-[#838ba7] hover:text-slate-600 dark:hover:text-[#949cbb] transition-colors"
        >
            <Icon icon="solar:close-circle-linear" width="0.85rem" />
        </button>
    </div>
{/if}
