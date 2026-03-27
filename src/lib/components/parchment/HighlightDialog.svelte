<script lang="ts">
    import Icon from "@iconify/svelte";
    import { onDestroy } from "svelte";
    import {
        loadHighlights,
        deleteHighlight,
        formatDate,
    } from "$lib/functions/bookmarks";
    import { highlights, pendingJumpAyah } from "$lib/stores/bookmarks.store";
    import { surahLabels, selectedSurahIdx } from "$lib/stores/quran.svelte";
    import { bringToFront } from "$lib/stores/window-manager.store";

    interface Props {
        open: boolean;
        onClose: () => void;
    }
    let { open, onClose }: Props = $props();

    $effect(() => {
        if (open) loadHighlights();
    });

    function surahName(n: number): string {
        return $surahLabels[n - 1]?.en ?? `Surah ${n}`;
    }

    function navigate(surah: number, ayah: number) {
        selectedSurahIdx.set(surah);
        pendingJumpAyah.set(ayah);
        onClose();
    }

    // ── Drag ────────────────────────────────────────────────────────────────
    const PANEL_W = 440;

    let x = $state(0);
    let y = $state(0);
    let zIndex = $state(500);
    let isDragging = $state(false);
    let dragStartX = 0,
        dragStartY = 0,
        startX = 0,
        startY = 0;
    let initialized = false;

    $effect(() => {
        if (open && !initialized) {
            x = Math.max(0, (window.innerWidth - PANEL_W) / 2);
            y = Math.max(8, (window.innerHeight - 420) * 0.25);
            zIndex = bringToFront();
            initialized = true;
        }
        if (!open) initialized = false;
    });

    function startDrag(e: PointerEvent) {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startX = x;
        startY = y;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", stopDrag, { once: true });
    }

    function onDrag(e: PointerEvent) {
        x = Math.max(
            0,
            Math.min(
                window.innerWidth - PANEL_W,
                startX + (e.clientX - dragStartX),
            ),
        );
        y = Math.max(
            0,
            Math.min(
                window.innerHeight - 60,
                startY + (e.clientY - dragStartY),
            ),
        );
    }

    function stopDrag() {
        isDragging = false;
        window.removeEventListener("pointermove", onDrag);
    }

    onDestroy(() => {
        if (typeof window !== "undefined")
            window.removeEventListener("pointermove", onDrag);
    });
</script>

{#if open}
    <div
        role="dialog"
        aria-modal="true"
        aria-label="Highlights"
        class="fixed flex flex-col rounded-lg border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
        style="left:{x}px; top:{y}px; width:{PANEL_W}px; max-height:85vh; z-index:{zIndex};"
        onpointerdown={() => {
            zIndex = bringToFront();
        }}
    >
        <!-- Header -->
        <div
            class="shrink-0 bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-5 py-4 select-none {isDragging
                ? 'cursor-grabbing'
                : 'cursor-grab'}"
            onpointerdown={startDrag}
            role="banner"
        >
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                    <div
                        class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gold-200 dark:bg-[#414559]"
                    >
                        <Icon
                            icon="solar:magic-stick-3-bold-duotone"
                            class="text-brand-gold-500"
                            width="1rem"
                        />
                    </div>
                    <div>
                        <h2
                            class="text-sm font-semibold text-brand-charcoal-900"
                        >
                            Highlights
                        </h2>
                        <p class="text-[11px] text-brand-charcoal-300">
                            {$highlights.length} saved
                        </p>
                    </div>
                </div>
                <button
                    onclick={onClose}
                    aria-label="Close"
                    class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                >
                    <Icon icon="solar:close-circle-bold-duotone" width="1rem" />
                </button>
            </div>
        </div>

        <!-- List -->
        <div class="flex-1 overflow-y-auto bg-brand-sand-50">
            {#if $highlights.length === 0}
                <div
                    class="flex flex-col items-center gap-3 py-16 text-center px-6"
                >
                    <div
                        class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-sand-100"
                    >
                        <Icon
                            icon="solar:magic-stick-3-bold-duotone"
                            class="text-brand-sand-400"
                            width="1.75rem"
                        />
                    </div>
                    <div>
                        <p class="text-sm font-medium text-brand-charcoal-500">
                            No highlights yet
                        </p>
                        <p class="mt-1 text-xs text-brand-charcoal-300">
                            Select text in the parchment and tap<br />"Save
                            Highlight" to capture it here.
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
                                class="mb-2.5 font-scheherazade text-xl leading-loose text-brand-charcoal-900 wrap-break-word overflow-hidden"
                                dir="rtl"
                            >
                                {hl.text}
                            </p>
                            <!-- Footer row -->
                            <div
                                class="flex items-center justify-between gap-2"
                            >
                                <div class="flex items-center gap-1.5 min-w-0">
                                    <span
                                        class="inline-flex items-center gap-1 rounded-md bg-brand-gold-100 border border-brand-gold-200 px-2 py-0.5 text-[10px] font-medium text-brand-gold-600 shrink-0"
                                    >
                                        <Icon
                                            icon="solar:book-bold"
                                            width="0.65rem"
                                        />
                                        {surahName(hl.surah)} · {hl.ayah}
                                    </span>
                                    <span
                                        class="text-[10px] text-brand-charcoal-300 truncate"
                                        >{formatDate(hl.created_at)}</span
                                    >
                                </div>
                                <div class="flex shrink-0 items-center gap-1">
                                    <button
                                        onclick={() =>
                                            navigate(hl.surah, hl.ayah)}
                                        class="cursor-pointer flex items-center gap-1 rounded-lg bg-white dark:bg-[#414559] border border-brand-sand-200 px-2.5 py-1 text-[11px] font-medium text-brand-charcoal-500 hover:bg-brand-gold-100 dark:hover:bg-[#51576d] active:bg-brand-gold-200 transition-colors"
                                    >
                                        <Icon
                                            icon="solar:arrow-right-up-linear"
                                            width="0.7rem"
                                        />
                                        Go
                                    </button>
                                    <button
                                        onclick={() => deleteHighlight(hl.id)}
                                        class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg text-brand-charcoal-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-400 active:bg-red-100 dark:active:bg-red-900/50 transition-colors"
                                        title="Delete"
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
