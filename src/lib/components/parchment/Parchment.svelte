<script lang="ts">
    import Icon from "@iconify/svelte";
    import NextPrevButton from "./NextPrevButton.svelte";
    import ParchmentActionBar from "./ParchmentActionBar.svelte";
    import BookmarkDialog from "./BookmarkDialog.svelte";
    import HighlightDialog from "./HighlightDialog.svelte";
    import RecitationPlayer from "./RecitationPlayer.svelte";
    import {
        hideSurahPage,
        isSidebar,
        selectedSurahIdx,
        surahMorphology,
        morphologyMultiSurahList,
        morphologyAyahFilter,
    } from "$lib/stores/quran.svelte";
    import type { SurahMorphology } from "$lib/types/morphology";
    import { morphFontSize } from "$lib/stores/morphology.store";
    import MorphologyView from "./MorphologyView.svelte";
    import {
        pendingJumpAyah,
        pendingHighlight,
    } from "$lib/stores/bookmarks.store";
    import HighlightSaveDialog from "./HighlightSaveDialog.svelte";
    import {
        totalAyahsInSurah,
        recitationPlaylist,
        recitationDownloadDialogOpen,
        reciterSelectDialogOpen,
    } from "$lib/stores/recitation.store";
    import RecitationDownloadDialog from "./RecitationDownloadDialog.svelte";
    import ReciterSelectDialog from "./ReciterSelectDialog.svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { activeTranslatorId } from "$lib/stores/translation.store";
    import {
        zenMode,
        appDarkMode,
        zenPeek,
        singlePageMargin,
    } from "$lib/stores/editor.store";

    let scrollContainer = $state<HTMLElement | null>(null);
    let showBookmarks = $state(false);
    let showHighlights = $state(false);

    $effect(() => {
        totalAyahsInSurah.set($surahMorphology?.ayahs?.length ?? 0);
    });

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
            anchor?.scrollIntoView({ behavior: "smooth", block: "center" });

            // Soft highlight on all words + the verse number of the target ayah
            const words = scrollContainer?.querySelectorAll<HTMLElement>(
                `[data-ayah="${target}"], #ayah-${target}`,
            );
            words?.forEach((el) => {
                el.classList.remove("ayah-highlight");
                // force reflow so re-triggering works if same ayah is jumped to twice
                void el.offsetWidth;
                el.classList.add("ayah-highlight");
            });
            setTimeout(() => {
                words?.forEach((el) => el.classList.remove("ayah-highlight"));
            }, 2500);
        }, 800);
    });

    // Text selection / highlight state
    interface SelectionInfo {
        text: string;
        surah: number;
        ayah: number;
        x: number;
        y: number;
    }
    let selectionInfo = $state<SelectionInfo | null>(null);

    function handleMouseUp(event: MouseEvent) {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            selectionInfo = null;
            return;
        }

        const text = selection.toString().trim();
        if (!text) {
            selectionInfo = null;
            return;
        }

        const range = selection.getRangeAt(0);

        // Try startContainer, endContainer, then commonAncestorContainer in order
        // to handle selections that start/end on non-word elements (verse numbers, gaps)
        const candidates = [
            range.startContainer,
            range.endContainer,
            range.commonAncestorContainer,
        ];

        let wordEl: HTMLElement | null = null;
        for (const node of candidates) {
            const el =
                node.nodeType === Node.TEXT_NODE
                    ? (node as Text).parentElement
                    : (node as HTMLElement);
            wordEl = el?.closest("[data-ayah]") as HTMLElement | null;
            if (wordEl) break;
        }

        if (!wordEl) {
            selectionInfo = null;
            return;
        }

        const surah = parseInt(wordEl.dataset.surah ?? "0");
        const ayah = parseInt(wordEl.dataset.ayah ?? "0");

        if (!surah || !ayah) {
            selectionInfo = null;
            return;
        }

        selectionInfo = {
            text,
            surah,
            ayah,
            x: event.clientX,
            y: event.clientY,
        };
    }

    let isSearching = $state(false);

    async function handleSearch(query: string) {
        if (!query.trim()) {
            morphologyMultiSurahList.set(null);
            morphologyAyahFilter.set(null);
            recitationPlaylist.set(null);
            return;
        }

        // Reference shortcut: "surah:ayah" jumps directly (e.g., "2:255")
        const refMatch = query.trim().match(/^(\d{1,3})\s*:\s*(\d{1,3})$/);
        if (refMatch) {
            const surah = parseInt(refMatch[1], 10);
            const ayah = parseInt(refMatch[2], 10);
            if (surah >= 1 && surah <= 114 && ayah >= 1) {
                morphologyMultiSurahList.set(null);
                morphologyAyahFilter.set(null);
                recitationPlaylist.set(null);
                selectedSurahIdx.set(surah);
                pendingJumpAyah.set(ayah);
                return;
            }
        }

        isSearching = true;
        try {
            const matches = await invoke<{ surah: number; ayah: number }[]>(
                "search_quran",
                {
                    query,
                    translatorId: $activeTranslatorId,
                },
            );
            if (!matches.length) {
                morphologyMultiSurahList.set(null);
                morphologyAyahFilter.set(null);
                recitationPlaylist.set(null);
                return;
            }

            // Group by surah
            const surahAyahMap = new Map<number, number[]>();
            for (const m of matches) {
                if (!surahAyahMap.has(m.surah)) surahAyahMap.set(m.surah, []);
                surahAyahMap.get(m.surah)!.push(m.ayah);
            }

            // Load morphology for each surah and filter to matched ayahs
            const surahNums = [...surahAyahMap.keys()].sort((a, b) => a - b);
            const morphResults = await Promise.all(
                surahNums.map((s) =>
                    invoke<SurahMorphology>("get_surah_morphology", {
                        surahNumber: s,
                    }),
                ),
            );

            const filtered: SurahMorphology[] = morphResults.map((morph, i) => {
                const allowed = new Set(surahAyahMap.get(surahNums[i])!);
                return {
                    ...morph,
                    ayahs: morph.ayahs.filter((a) => allowed.has(a.ayah)),
                };
            });

            // Build recitation playlist
            const playlist: { surah: number; ayah: number }[] = [];
            for (const s of filtered) {
                for (const a of s.ayahs)
                    playlist.push({ surah: s.surah, ayah: a.ayah });
            }

            morphologyMultiSurahList.set(filtered);
            morphologyAyahFilter.set(null);
            recitationPlaylist.set(playlist);
        } catch (e) {
            console.error("Search failed", e);
        } finally {
            isSearching = false;
        }
    }
</script>

<!-- style:width="{Math.round(($singlePageMargin / 12) * 100)}%" -->
<div
    id="tour-parchment"
    class={`${$hideSurahPage() ? "hidden " : ""}relative z-1 h-full justify-center min-w-0 text-center flex flex-col items-center rounded-sm ${$zenMode && $appDarkMode ? "bg-transparent" : "bg-white dark:bg-[#303446]"} ${$zenMode ? "" : "sm:shadow-xl sm:shadow-slate-200/60 dark:sm:shadow-black/30"}`}
>
    <div class="w-full z-30">
        <ParchmentActionBar
            onOpenBookmarks={() => (showBookmarks = true)}
            onOpenHighlights={() => (showHighlights = true)}
            onSearch={handleSearch}
            {isSearching}
        />
    </div>

    {#if $zenMode}
        {#if !$isSidebar}
            <div
                class="absolute left-0 top-0 h-full w-px z-10 pointer-events-none"
                style="background: linear-gradient(to bottom, transparent 0%, {$appDarkMode
                    ? 'rgba(229,200,144,0.25)'
                    : 'rgba(229,200,144,0.55)'} 20%, {$appDarkMode
                    ? 'rgba(229,200,144,0.25)'
                    : 'rgba(229,200,144,0.55)'} 80%, transparent 100%)"
            ></div>
        {/if}
        <div
            class="absolute top-0 left-0 w-1/2 h-px z-10 pointer-events-none"
            style="background: linear-gradient(to right, transparent 0%, {$appDarkMode
                ? 'rgba(229,200,144,0.25)'
                : 'rgba(229,200,144,0.55)'} 20%, {$appDarkMode
                ? 'rgba(229,200,144,0.25)'
                : 'rgba(229,200,144,0.55)'} 80%, transparent 100%)"
        ></div>
    {/if}

    <!-- Surah label — anchored to outer stable div so font-size reflows don't shift it -->
    <div
        dir="ltr"
        class="{$zenMode
            ? $zenPeek
                ? 'opacity-50 transition-opacity duration-200'
                : 'opacity-0 hover:opacity-100 transition-opacity duration-200'
            : ''} absolute -top-3.5 right-12 z-50"
    >
        {#if $morphologyMultiSurahList !== null}
            <span
                class="inline-flex items-center gap-1.5 rounded-full px-2 py-1 leading-none
                         bg-brand-sand-100/80 border border-brand-sand-200 backdrop-blur-sm
                         dark:bg-[#292c3c]/80 dark:border-[#414559]"
            >
                <span
                    class="inline-block h-1.5 w-1.5 rounded-full bg-brand-gold-400 dark:bg-[#e5c890]"
                ></span>
                <span
                    class="inline-block h-1.5 w-1.5 rounded-full bg-brand-gold-400 dark:bg-[#e5c890]"
                ></span>
            </span>
        {:else}
            <span
                class="inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-[9px] font-semibold leading-none
                         bg-brand-sand-100/80 border border-brand-sand-200 backdrop-blur-sm
                         dark:bg-[#292c3c]/80 dark:border-[#414559] text-brand-gold-500 dark:text-[#e5c890]"
            >
                <Icon icon="solar:book-bold-duotone" width="0.6rem" />
                {$surahMorphology?.surah ?? ""}
            </span>
        {/if}
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
        bind:this={scrollContainer}
        role="document"
        onmouseup={handleMouseUp}
        class={`default-scroll relative w-full flex-1 min-h-0 overflow-y-auto px-12 pt-10 pb-20 text-right ${$morphFontSize} leading-loose text-slate-600 dark:text-[#c6d0f5] ${$isSidebar ? "rounded-r-md" : "rounded-md"} ${$zenMode ? "" : "border border-stone-200 dark:border-[#414559]"}`}
    >
        <MorphologyView />
    </div>

    <div
        class="absolute bottom-7 inset-x-6 z-30 flex justify-center pointer-events-none"
    >
        <div class="pointer-events-auto">
            <RecitationPlayer {scrollContainer} />
        </div>
    </div>
    <NextPrevButton position={"absolute -bottom-4 inset-x-0 z-20"} />
</div>

<!-- Dialogs — rendered outside the z-1 stacking context so their fixed backdrop covers the full viewport -->
<BookmarkDialog open={showBookmarks} onClose={() => (showBookmarks = false)} />
<HighlightDialog
    open={showHighlights}
    onClose={() => (showHighlights = false)}
/>
<HighlightSaveDialog />
<RecitationDownloadDialog
    open={$recitationDownloadDialogOpen}
    onClose={() => recitationDownloadDialogOpen.set(false)}
/>
<ReciterSelectDialog
    open={$reciterSelectDialogOpen}
    onClose={() => reciterSelectDialogOpen.set(false)}
/>

<!-- Floating Save Highlight button -->
{#if selectionInfo}
    <div
        class="fixed z-40 flex items-center gap-1.5 rounded-lg border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/50 backdrop-blur-sm dark:bg-[#292c3c] px-3 py-1.5 shadow-lg"
        style="left: {selectionInfo.x}px; top: {selectionInfo.y -
            48}px; transform: translateX(-50%);"
    >
        <Icon
            icon="solar:pen-new-square-bold-duotone"
            class="shrink-0 text-brand-gold-500 dark:text-[#e5c890]"
            width="0.9rem"
        />
        <button
            onclick={() => {
                pendingHighlight.set(selectionInfo);
                window.getSelection()?.removeAllRanges();
                selectionInfo = null;
            }}
            class="cursor-pointer text-xs font-medium text-brand-charcoal-900 dark:text-[#c6d0f5] hover:text-brand-gold-500 dark:hover:text-[#e5c890] transition-colors"
        >
            Save Highlight
        </button>
        <button
            onclick={() => (selectionInfo = null)}
            aria-label="Dismiss"
            class="cursor-pointer ml-0.5 text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-charcoal-500 dark:hover:text-[#c6d0f5] transition-colors"
        >
            <Icon icon="solar:close-circle-linear" width="0.85rem" />
        </button>
    </div>
{/if}
