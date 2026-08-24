<script lang="ts">
    import Icon from "@iconify/svelte";
    import { fly } from "svelte/transition";
    import {
        loadHighlights,
        deleteHighlight,
        formatDate,
    } from "$lib/functions/bookmarks";
    import { highlights, pendingJumpAyah } from "$lib/stores/bookmarks.store";
    import { surahLabels, selectedSurahIdx } from "$lib/stores/quran.svelte";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import { anchorBelow } from "$lib/utils/anchoredPanel";
    import { headerHeight } from "$lib/stores/header.store";
    import { csdMarginPx } from "$lib/stores/window-state.store";
    import { t, locale } from "$lib/i18n";
    import { get } from "svelte/store";
    import { lexicalEditorInstance } from "$lib/stores/editor.store";
    import DialogPanelHeader from "$lib/components/shared/DialogPanelHeader.svelte";
    import {
        $createParagraphNode as createParagraphNode,
        $createTextNode as createTextNode,
        $insertNodes as insertNodes,
    } from "lexical";

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

    let insertingId = $state<number | null>(null);

    $effect(() => {
        if (open) loadHighlights();
    });

    function surahName(n: number): string {
        return $surahLabels[n - 1]?.en ?? `Surah ${n}`;
    }

    function navigate(surah: number, ayah: number) {
        selectedSurahIdx.set(surah);
        pendingJumpAyah.set(ayah);
    }

    function insertHighlightToLexical(hl: (typeof $highlights)[0]) {
        const editor = get(lexicalEditorInstance);
        if (!editor) return;
        insertingId = hl.id;
        const label = `${surahName(hl.surah)} · ${get(t)("bookmark.ayah")} ${hl.ayah}`;
        editor.update(() => {
            const arabicPara = createParagraphNode();
            arabicPara.append(createTextNode(hl.text));
            const attrPara = createParagraphNode();
            attrPara.append(createTextNode(label));
            if (hl.note) {
                const notePara = createParagraphNode();
                notePara.append(createTextNode(hl.note));
                insertNodes([arabicPara, notePara, attrPara]);
            } else {
                insertNodes([arabicPara, attrPara]);
            }
        });
        insertingId = null;
    }

    // ── Drag ────────────────────────────────────────────────────────────────
    const PANEL_W = 440;

    let zIndex = $state(500);
    let initialized = false;

    // Re-read on every open so a resized window or a moved button still lines
    // up, and so the panel follows the header when the UI scale changes.
    // $headerHeight is the bar's own measured height, not its Y position — add
    // the CSD shadow margin (the header's top edge sits that far down from the
    // true window top while the shell floats) to get the bar's actual bottom.
    const placement = $derived(
        open ? anchorBelow(anchor, PANEL_W, $headerHeight + $csdMarginPx, 1) : null,
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
        aria-label={$t("highlight.title")}
        class="fixed flex flex-col rounded-b-xl border border-t-0 border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-[0_14px_28px_-10px_rgba(0,0,0,0.28)] dark:shadow-[0_14px_28px_-10px_rgba(0,0,0,0.55)] overflow-hidden"
        style="left:{placement?.x ?? 0}px; top:{placement?.y ?? 0}px; width:{PANEL_W}px; max-height:{placement?.maxHeight ?? 0}px; z-index:{zIndex};"
    >
        <DialogPanelHeader
            icon="solar:pen-new-square-bold-duotone"
            title={$t("highlight.title")}
            isDragging={false}
            hideClose={true}
            sheet={true}
            {onClose}
            onpointerdown={() => {}}
        >
            {#snippet action()}
                <span
                    class="text-[10px] text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    {$t("highlight.n_saved", { n: $highlights.length })}
                </span>
            {/snippet}
        </DialogPanelHeader>

        <!-- List -->
        <div class="flex-1 overflow-y-auto bg-brand-sand-50 dark:bg-[#232634]">
            {#if $highlights.length === 0}
                <div
                    class="flex flex-col items-center gap-3 py-16 text-center px-6"
                >
                    <div
                        class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-sand-100"
                    >
                        <Icon
                            icon="solar:pen-new-square-bold-duotone"
                            class="text-brand-sand-400"
                            width="1.75rem"
                        />
                    </div>
                    <div>
                        <p class="text-sm font-medium text-brand-charcoal-500">
                            {$t("highlight.empty_title")}
                        </p>
                        <p class="mt-1 text-[11px] text-brand-charcoal-300">
                            {$t("highlight.empty_desc")}
                        </p>
                    </div>
                </div>
            {:else}
                <div class="divide-y divide-brand-sand-200">
                    {#each $highlights as hl (hl.id)}
                        <div
                            class="group px-5 py-3.5 hover:bg-brand-gold-50 dark:hover:bg-[#414559] transition-colors"
                        >
                            <!-- Arabic text -->
                            <p
                                class="mb-1.5 font-scheherazade text-lg leading-loose text-brand-charcoal-500 wrap-break-word overflow-hidden"
                                dir="rtl"
                            >
                                {hl.text}
                            </p>
                            {#if hl.note}
                                <p
                                    class="mb-2 text-[11px] text-brand-charcoal-400 dark:text-[#838ba7] italic line-clamp-2"
                                >
                                    {hl.note}
                                </p>
                            {/if}
                            <!-- Footer row -->
                            <div
                                class="flex items-center justify-between gap-2"
                            >
                                <div class="flex items-center gap-1.5 min-w-0">
                                    <span
                                        class="inline-flex items-center gap-1 rounded-md bg-brand-gold-100 border border-brand-gold-200 px-2 py-0.5 text-[11px] font-medium text-brand-gold-600 shrink-0"
                                    >
                                        <Icon
                                            icon="solar:book-bold"
                                            width="0.65rem"
                                        />
                                        {surahName(hl.surah)} · {hl.ayah}
                                    </span>
                                    <span
                                        class="text-[11px] text-brand-charcoal-300 truncate"
                                        >{formatDate(
                                            hl.created_at,
                                            $locale,
                                        )}</span
                                    >
                                </div>
                                <div class="flex shrink-0 items-center gap-1">
                                    <button
                                        onclick={() =>
                                            navigate(hl.surah, hl.ayah)}
                                        class="cursor-pointer flex items-center gap-1 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-3 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 transition-colors"
                                    >
                                        <Icon
                                            icon="solar:arrow-right-up-linear"
                                            width="0.7rem"
                                        />
                                        {$t("bookmark.go")}
                                    </button>
                                    <button
                                        onclick={() =>
                                            insertHighlightToLexical(hl)}
                                        disabled={!$lexicalEditorInstance}
                                        title={!$lexicalEditorInstance
                                            ? $t("manuscript.no_editor")
                                            : $t("manuscript.insert_tooltip")}
                                        class="cursor-pointer flex items-center gap-1 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-3 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Icon
                                            icon="solar:pen-new-square-bold"
                                            width="0.7rem"
                                        />
                                        {$t("manuscript.insert")}
                                    </button>
                                    <button
                                        onclick={() => deleteHighlight(hl.id)}
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
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/if}
