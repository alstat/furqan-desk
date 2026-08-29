<script lang="ts">
    import Icon from "@iconify/svelte";
    import { tick } from "svelte";
    import { fly } from "svelte/transition";
    import {
        loadBookmarks,
        addBookmark,
        deleteBookmark,
        loadLastRead,
        formatDate,
    } from "$lib/functions/bookmarks";
    import {
        bookmarks,
        lastRead,
        currentReadingAyah,
        pendingJumpAyah,
    } from "$lib/stores/bookmarks.store";
    import { surahLabels, selectedSurahIdx } from "$lib/stores/quran.svelte";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import { anchorBelow } from "$lib/utils/anchoredPanel";
    import { headerBottom } from "$lib/stores/header.store";
    import { t, locale } from "$lib/i18n";
    import { get } from "svelte/store";
    import { invoke } from "@tauri-apps/api/core";
    import { copyToClipboard } from "$lib/utils/clipboard";
    import type { SurahMorphology } from "$lib/types/morphology";
    import { isPro } from "$lib/stores/auth.store";
    import AiSelectionToolbar from "$lib/components/shared/AiSelectionToolbar.svelte";
    import DialogPanelHeader from "$lib/components/shared/DialogPanelHeader.svelte";

    interface Props {
        open: boolean;
        onClose: () => void;
        /**
         * Rect of the header button this drops out of. The panel is a menu now
         * rather than a floating window: it hangs under its button, closes on
         * an outside click or Escape, and is not dragged around.
         */
        anchor?: DOMRect | null;
    }
    let { open, onClose, anchor = null }: Props = $props();

    let ayahInput = $state(1);
    let noteInput = $state("");
    let saving = $state(false);
    let saveError = $state("");
    // Id of the bookmark being copied (its ayah text is fetched first) and the
    // one whose "copied" checkmark is currently showing.
    let copyingId = $state<number | null>(null);
    let copiedId = $state<number | null>(null);
    let textareaEl = $state<HTMLTextAreaElement | null>(null);

    // ── AI selection toolbar (pro users) ─────────────────────────────────────
    let aiSelection = $state<{
        start: number;
        end: number;
        text: string;
        x: number;
        y: number;
    } | null>(null);

    // Anchor the floating toolbar above the note textarea whenever it holds
    // a non-empty selection. Textareas don't expose per-character coordinates,
    // so the textarea itself is the anchor.
    function updateAiSelection() {
        if (!$isPro || !textareaEl) {
            aiSelection = null;
            return;
        }
        const start = textareaEl.selectionStart ?? 0;
        const end = textareaEl.selectionEnd ?? 0;
        if (start === end) {
            aiSelection = null;
            return;
        }
        const text = textareaEl.value.slice(start, end);
        if (!text.trim()) {
            aiSelection = null;
            return;
        }
        const rect = textareaEl.getBoundingClientRect();
        const viewportWidth = window.innerWidth || 0;
        aiSelection = {
            start,
            end,
            text,
            x: Math.max(
                180,
                Math.min(viewportWidth - 180, rect.left + rect.width / 2),
            ),
            y: Math.max(12, rect.top - 8),
        };
    }

    function replaceAiSelection(replacement: string) {
        if (!aiSelection) return;
        const { start, end } = aiSelection;
        noteInput =
            noteInput.slice(0, start) + replacement + noteInput.slice(end);
        aiSelection = null;
        const caret = start + replacement.length;
        tick().then(() => {
            textareaEl?.focus();
            textareaEl?.setSelectionRange(caret, caret);
        });
    }

    $effect(() => {
        if (open) {
            loadBookmarks();
            loadLastRead();
            const pos = $currentReadingAyah;
            if (pos && pos.surah === $selectedSurahIdx) {
                ayahInput = pos.ayah;
            } else {
                ayahInput = 1;
            }
            noteInput = "";
            saveError = "";
            aiSelection = null;
        }
    });

    function surahName(n: number): string {
        return $surahLabels[n - 1]?.en ?? `Surah ${n}`;
    }

    async function handleAdd() {
        if (!ayahInput || ayahInput < 1) {
            saveError = get(t)("bookmark.invalid_ayah");
            return;
        }
        saving = true;
        saveError = "";
        try {
            await addBookmark(
                $selectedSurahIdx,
                ayahInput,
                noteInput.trim() || null,
            );
            noteInput = "";
            aiSelection = null;
        } catch (e) {
            saveError = String(e);
        } finally {
            saving = false;
        }
    }

    function navigate(surah: number, ayah: number) {
        selectedSurahIdx.set(surah);
        pendingJumpAyah.set(ayah);
    }

    // Same shape the editor insert used to produce: the ayah's Arabic, then the
    // reference line. The Arabic is not on the bookmark row, so it is resolved
    // from the surah morphology first.
    async function copyBookmark(bm: (typeof $bookmarks)[0]) {
        copyingId = bm.id;
        try {
            const morph = await invoke<SurahMorphology>(
                "get_surah_morphology",
                { surahNumber: bm.surah },
            );
            const ayahMorph = morph.ayahs.find((a) => a.ayah === bm.ayah);
            const arabicText =
                ayahMorph?.words.map((w) => w.combined_arabic).join(" ") ?? "";
            const label = `${surahName(bm.surah)} · ${get(t)("bookmark.ayah")} ${bm.ayah}`;
            if (!(await copyToClipboard(`${arabicText}\n${label}`))) return;
            copiedId = bm.id;
            setTimeout(() => {
                if (copiedId === bm.id) copiedId = null;
            }, 1500);
        } finally {
            copyingId = null;
        }
    }

    // ── Drag ────────────────────────────────────────────────────────────────
    const PANEL_W = 440;

    let zIndex = $state(500);
    let initialized = false;

    // Re-read on every open so a resized window or a moved button still lines
    // up, and so the panel follows the header when the UI scale changes.
    // $headerBottom is the bar's measured bottom edge in viewport coordinates,
    // border and CSD shadow margin included. Hanging the panel one pixel above
    // it puts the panel — which is `border-t-0` — over the bar's bottom border,
    // so the two read as one surface rather than being split by a hairline.
    const placement = $derived(
        open ? anchorBelow(anchor, PANEL_W, $headerBottom - 1, 0) : null,
    );

    $effect(() => {
        if (open && !initialized) {
            zIndex = bringToFront();
            initialized = true;
        }
        if (!open) initialized = false;
    });

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") onClose();
    }


    // Rendered inside Parchment, whose root gets display:none when the surah
    // page is hidden. Portal the dialog to <body> so it escapes that hidden
    // subtree and stays usable while the surah page is hidden.
    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }
</script>

<svelte:window on:keydown={open ? handleKeydown : undefined} />

<!-- Backdrop: a click anywhere outside dismisses the menu, the way GlobalSearch
     does. Transparent — a menu should not dim the page behind it. -->
{#if open}
    <div
        use:portal
        role="presentation"
        class="fixed inset-0"
        style="z-index:{zIndex - 1};"
        onclick={onClose}
        onkeydown={() => {}}
    ></div>
{/if}

{#if open}
    <div
        use:portal
        transition:fly={{ y: -10, duration: 160, opacity: 0 }}
        role="dialog"
        aria-label={$t("bookmark.title")}
        class="fixed flex flex-col rounded-b-xl border border-t-0 border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-[0_14px_28px_-10px_rgba(0,0,0,0.28)] dark:shadow-[0_14px_28px_-10px_rgba(0,0,0,0.55)] overflow-hidden"
        style="left:{placement?.x ?? 0}px; top:{placement?.y ?? 0}px; width:{PANEL_W}px; max-height:{placement?.maxHeight ?? 0}px; z-index:{zIndex};"
    >
        <DialogPanelHeader
            icon="solar:bookmark-bold-duotone"
            title={$t("bookmark.title")}
            isDragging={false}
            hideClose={true}
            sheet={true}
            {onClose}
            onpointerdown={() => {}}
        >
            {#snippet action()}
                <span
                    class="text-[0.625rem] text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    {$t("bookmark.n_saved", { n: $bookmarks.length })}
                </span>
            {/snippet}
        </DialogPanelHeader>

        <div
            class="flex-1 overflow-y-auto bg-brand-sand-50 dark:bg-[#232634]"
            onscroll={() => (aiSelection = null)}
        >
            <!-- Add bookmark -->
            <div class="px-5 py-4 border-b border-brand-sand-200">
                <p
                    class="mb-3 text-[0.6875rem] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                >
                    {$t("bookmark.add")}
                </p>

                <!-- Surah + Ayah row -->
                <div class="mb-3 flex items-center gap-2">
                    <div
                        class="flex flex-1 items-center gap-2 rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3 py-2"
                    >
                        <Icon
                            icon="solar:book-bold-duotone"
                            class="shrink-0 text-brand-gold-400"
                            width="0.85rem"
                        />
                        <span
                            class="text-[0.6875rem] font-medium text-brand-charcoal-900 truncate"
                            >{surahName($selectedSurahIdx)}</span
                        >
                    </div>
                    <div
                        class="flex items-center gap-2 rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3 py-2"
                    >
                        <label
                            for="bm-ayah"
                            class="text-[0.6875rem] text-brand-charcoal-300 shrink-0"
                            >{$t("bookmark.ayah")}</label
                        >
                        <input
                            id="bm-ayah"
                            type="number"
                            min="1"
                            bind:value={ayahInput}
                            class="w-14 bg-transparent text-[0.6875rem] font-semibold text-brand-charcoal-900 focus:outline-none"
                        />
                    </div>
                </div>

                <textarea
                    placeholder={$t("bookmark.note_placeholder")}
                    bind:this={textareaEl}
                    bind:value={noteInput}
                    onselect={updateAiSelection}
                    onkeyup={updateAiSelection}
                    onmouseup={updateAiSelection}
                    oninput={updateAiSelection}
                    rows="2"
                    class="mb-3 w-full resize-none rounded-xl border border-brand-sand-200 bg-brand-sand-50/80 dark:bg-[#2b2b2b]/80 px-3 py-2.5 text-[0.6875rem] text-brand-charcoal-900 placeholder-brand-charcoal-300 focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 hover:border-brand-sand-400 hover:bg-brand-sand-100 transition-all"
                ></textarea>

                {#if saveError}
                    <p
                        class="mb-2 flex items-center gap-1 text-[0.6875rem] text-red-500"
                    >
                        <Icon
                            icon="solar:danger-circle-bold"
                            width="0.75rem"
                        />{saveError}
                    </p>
                {/if}

                <button
                    onclick={handleAdd}
                    disabled={saving}
                    class="cursor-pointer flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 py-1.5 text-[0.6875rem] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
                >
                    <Icon icon="solar:bookmark-bold" width="0.8rem" />
                    {saving ? $t("bookmark.saving") : $t("bookmark.save")}
                </button>
            </div>

            <!-- Last read -->
            {#if $lastRead}
                <div class="px-5 py-4 border-b border-brand-sand-200">
                    <p
                        class="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                    >
                        {$t("bookmark.continue_reading")}
                    </p>
                    <div
                        class="flex items-center justify-between rounded-xl bg-brand-sand-100 dark:bg-[#303446] border border-brand-sand-200 dark:border-[#414559] px-4 py-3"
                    >
                        <div class="flex items-center gap-2.5">
                            <div
                                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-sand-100 dark:bg-[#414559] border border-brand-sand-200 dark:border-[#51576d]"
                            >
                                <Icon
                                    icon="solar:book-bookmark-bold-duotone"
                                    class="text-brand-gold-500"
                                    width="1rem"
                                />
                            </div>
                            <div>
                                <p
                                    class="text-[0.6875rem] font-semibold text-brand-charcoal-900"
                                >
                                    {surahName($lastRead.surah)} · {$t(
                                        "bookmark.ayah",
                                    )}
                                    {$lastRead.ayah}
                                </p>
                                <p class="text-[0.6875rem] text-brand-charcoal-300">
                                    {formatDate($lastRead.updated_at, $locale)}
                                </p>
                            </div>
                        </div>
                        <button
                            onclick={() =>
                                navigate($lastRead!.surah, $lastRead!.ayah)}
                            class="cursor-pointer flex items-center gap-1 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-3 py-1.5 text-[0.6875rem] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 transition-colors"
                        >
                            <Icon
                                icon="solar:arrow-right-up-linear"
                                width="0.7rem"
                            />
                            {$t("bookmark.go")}
                        </button>
                    </div>
                </div>
            {/if}

            <!-- Saved bookmarks -->
            <div class="px-5 py-4">
                <p
                    class="mb-3 text-[0.6875rem] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                >
                    {$t("bookmark.saved_section")}{$bookmarks.length
                        ? ` · ${$bookmarks.length}`
                        : ""}
                </p>

                {#if $bookmarks.length === 0}
                    <div
                        class="flex flex-col items-center gap-2 py-8 text-center"
                    >
                        <div
                            class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-sand-100"
                        >
                            <Icon
                                icon="solar:bookmark-bold-duotone"
                                class="text-brand-sand-400"
                                width="1.5rem"
                            />
                        </div>
                        <p class="text-[0.6875rem] text-brand-charcoal-300">
                            {$t("bookmark.empty")}
                        </p>
                    </div>
                {:else}
                    <div class="space-y-2">
                        {#each $bookmarks as bm (bm.id)}
                            <div
                                class="group flex items-start justify-between gap-3 rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3.5 py-3 hover:bg-brand-gold-50 dark:hover:bg-[#414559] transition-colors"
                            >
                                <div class="min-w-0 flex-1">
                                    <p
                                        class="text-[0.6875rem] font-semibold text-brand-charcoal-500"
                                    >
                                        {surahName(bm.surah)} · {$t(
                                            "bookmark.ayah",
                                        )}
                                        {bm.ayah}
                                    </p>
                                    {#if bm.note}
                                        <p
                                            class="mt-0.5 text-[0.6875rem] text-brand-charcoal-500 line-clamp-2"
                                        >
                                            {bm.note}
                                        </p>
                                    {/if}
                                    <p
                                        class="mt-1 text-[0.6875rem] text-brand-charcoal-300"
                                    >
                                        {formatDate(bm.created_at, $locale)}
                                    </p>
                                </div>
                                <div
                                    class="flex shrink-0 items-center gap-1 pt-0.5"
                                >
                                    <button
                                        onclick={() =>
                                            navigate(bm.surah, bm.ayah)}
                                        class="cursor-pointer flex items-center gap-1 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-3 py-1.5 text-[0.6875rem] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 transition-colors"
                                    >
                                        <Icon
                                            icon="solar:arrow-right-up-linear"
                                            width="0.7rem"
                                        />
                                        {$t("bookmark.go")}
                                    </button>
                                    <button
                                        onclick={() => copyBookmark(bm)}
                                        disabled={copyingId === bm.id}
                                        title={copiedId === bm.id
                                            ? $t("verse_of_day.copied")
                                            : $t("verse_of_day.copy_entry")}
                                        class="cursor-pointer flex items-center gap-1 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-3 py-1.5 text-[0.6875rem] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {#if copyingId === bm.id}
                                            <span
                                                class="w-3 h-3 rounded-full border border-gray-100 border-t-transparent animate-spin"
                                            ></span>
                                            {$t("verse_of_day.copy_entry")}
                                        {:else}
                                            <Icon
                                                icon={copiedId === bm.id
                                                    ? "solar:check-circle-bold"
                                                    : "solar:copy-bold-duotone"}
                                                width="0.7rem"
                                            />
                                            {copiedId === bm.id
                                                ? $t("verse_of_day.copied")
                                                : $t("verse_of_day.copy_entry")}
                                        {/if}
                                    </button>
                                    <button
                                        onclick={() => deleteBookmark(bm.id)}
                                        class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg text-brand-charcoal-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-400 active:bg-red-100 dark:active:bg-red-900/50 transition-colors"
                                        title={$t("bookmark.delete")}
                                    >
                                        <Icon
                                            icon="solar:trash-bin-minimalistic-bold"
                                            width="0.75rem"
                                        />
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>

        {#if $isPro && aiSelection}
            <AiSelectionToolbar
                selectedText={aiSelection.text}
                x={aiSelection.x}
                y={aiSelection.y}
                contextPrompt={`This text is a selection from a personal note attached to a Quran bookmark (${surahName($selectedSurahIdx)}, Ayah ${ayahInput}). Full note:\n\n${noteInput}`}
                onReplace={replaceAiSelection}
                onClose={() => (aiSelection = null)}
            />
        {/if}
    </div>
{/if}
