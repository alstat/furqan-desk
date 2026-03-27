<script lang="ts">
    import Icon from '@iconify/svelte';
    import { onDestroy } from 'svelte';
    import {
        loadBookmarks, addBookmark, deleteBookmark,
        loadLastRead, formatDate,
    } from '$lib/functions/bookmarks';
    import { bookmarks, lastRead, currentReadingAyah, pendingJumpAyah } from '$lib/stores/bookmarks.store';
    import { surahLabels, selectedSurahIdx } from '$lib/stores/quran.svelte';
    import { bringToFront } from '$lib/stores/window-manager.store';

    interface Props { open: boolean; onClose: () => void; }
    let { open, onClose }: Props = $props();

    let ayahInput = $state(1);
    let noteInput = $state('');
    let saving    = $state(false);
    let saveError = $state('');

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
            noteInput = '';
            saveError = '';
        }
    });

    function surahName(n: number): string {
        return $surahLabels[n - 1]?.en ?? `Surah ${n}`;
    }

    async function handleAdd() {
        if (!ayahInput || ayahInput < 1) { saveError = 'Enter a valid ayah number.'; return; }
        saving = true;
        saveError = '';
        try {
            await addBookmark($selectedSurahIdx, ayahInput, noteInput.trim() || null);
            noteInput = '';
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

    // ── Drag ────────────────────────────────────────────────────────────────
    const PANEL_W = 440;

    let x = $state(0);
    let y = $state(0);
    let zIndex = $state(500);
    let isDragging = $state(false);
    let dragStartX = 0, dragStartY = 0, startX = 0, startY = 0;
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
        window.addEventListener('pointermove', onDrag);
        window.addEventListener('pointerup', stopDrag, { once: true });
    }

    function onDrag(e: PointerEvent) {
        x = Math.max(0, Math.min(window.innerWidth - PANEL_W, startX + (e.clientX - dragStartX)));
        y = Math.max(0, Math.min(window.innerHeight - 60, startY + (e.clientY - dragStartY)));
    }

    function stopDrag() {
        isDragging = false;
        window.removeEventListener('pointermove', onDrag);
    }

    onDestroy(() => {
        if (typeof window !== 'undefined') window.removeEventListener('pointermove', onDrag);
    });
</script>

{#if open}
    <div
        role="dialog"
        aria-modal="true"
        aria-label="Bookmarks"
        class="fixed flex flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
        style="left:{x}px; top:{y}px; width:{PANEL_W}px; max-height:85vh; z-index:{zIndex};"
        onpointerdown={() => { zIndex = bringToFront(); }}
    >
            <!-- Header -->
            <div
                class="shrink-0 bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-5 py-4 select-none {isDragging ? 'cursor-grabbing' : 'cursor-grab'}"
                onpointerdown={startDrag}
                role="banner"
            >
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gold-200 dark:bg-[#414559]">
                            <Icon icon="solar:bookmark-bold-duotone" class="text-brand-gold-500" width="1rem" />
                        </div>
                        <div>
                            <h2 class="text-sm font-semibold text-brand-charcoal-900">Bookmarks</h2>
                            <p class="text-[11px] text-brand-charcoal-300">{$bookmarks.length} saved</p>
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

            <div class="flex-1 overflow-y-auto bg-brand-sand-50">

                <!-- Add bookmark -->
                <div class="px-5 py-4 border-b border-brand-sand-200">
                    <p class="mb-3 text-[11px] font-semibold uppercase tracking-widest text-brand-charcoal-300">Add Bookmark</p>

                    <!-- Surah + Ayah row -->
                    <div class="mb-3 flex items-center gap-2">
                        <div class="flex flex-1 items-center gap-2 rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3 py-2">
                            <Icon icon="solar:book-bold-duotone" class="shrink-0 text-brand-gold-400" width="0.85rem" />
                            <span class="text-[11px] font-medium text-brand-charcoal-900 truncate">{surahName($selectedSurahIdx)}</span>
                        </div>
                        <div class="flex items-center gap-2 rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3 py-2">
                            <label for="bm-ayah" class="text-[11px] text-brand-charcoal-300 shrink-0">Ayah</label>
                            <input
                                id="bm-ayah"
                                type="number"
                                min="1"
                                bind:value={ayahInput}
                                class="w-14 bg-transparent text-[11px] font-semibold text-brand-charcoal-900 focus:outline-none"
                            />
                        </div>
                    </div>

                    <textarea
                        placeholder="Add a note… (optional)"
                        bind:value={noteInput}
                        rows="2"
                        class="mb-3 w-full resize-none rounded-xl border border-brand-sand-200 bg-brand-sand-50/80 px-3 py-2.5 text-[11px] text-brand-charcoal-900 placeholder-brand-charcoal-300 focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 hover:border-brand-sand-400 hover:bg-brand-sand-100 transition-all"
                    ></textarea>

                    {#if saveError}
                        <p class="mb-2 flex items-center gap-1 text-[11px] text-red-500">
                            <Icon icon="solar:danger-circle-bold" width="0.75rem" />{saveError}
                        </p>
                    {/if}

                    <button
                        onclick={handleAdd}
                        disabled={saving}
                        class="cursor-pointer flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 py-2 text-[11px] font-semibold text-white hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
                    >
                        <Icon icon="solar:bookmark-bold" width="0.8rem" />
                        {saving ? 'Saving…' : 'Save Bookmark'}
                    </button>
                </div>

                <!-- Last read -->
                {#if $lastRead}
                    <div class="px-5 py-4 border-b border-brand-sand-200">
                        <p class="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-brand-charcoal-300">Continue Reading</p>
                        <div class="flex items-center justify-between rounded-xl bg-brand-sand-100 dark:bg-[#303446] border border-brand-sand-200 dark:border-[#414559] px-4 py-3">
                            <div class="flex items-center gap-2.5">
                                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-sand-100 dark:bg-[#414559] border border-brand-sand-200 dark:border-[#51576d]">
                                    <Icon icon="solar:book-bookmark-bold-duotone" class="text-brand-gold-500" width="1rem" />
                                </div>
                                <div>
                                    <p class="text-[11px] font-semibold text-brand-charcoal-900">
                                        {surahName($lastRead.surah)} · Ayah {$lastRead.ayah}
                                    </p>
                                    <p class="text-[11px] text-brand-charcoal-300">{formatDate($lastRead.updated_at)}</p>
                                </div>
                            </div>
                            <button
                                onclick={() => navigate($lastRead!.surah, $lastRead!.ayah)}
                                class="cursor-pointer flex items-center gap-1 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 transition-colors"
                            >
                                <Icon icon="solar:arrow-right-up-linear" width="0.7rem" />
                                Go
                            </button>
                        </div>
                    </div>
                {/if}

                <!-- Saved bookmarks -->
                <div class="px-5 py-4">
                    <p class="mb-3 text-[11px] font-semibold uppercase tracking-widest text-brand-charcoal-300">
                        Saved{$bookmarks.length ? ` · ${$bookmarks.length}` : ''}
                    </p>

                    {#if $bookmarks.length === 0}
                        <div class="flex flex-col items-center gap-2 py-8 text-center">
                            <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-sand-100">
                                <Icon icon="solar:bookmark-bold-duotone" class="text-brand-sand-400" width="1.5rem" />
                            </div>
                            <p class="text-[11px] text-brand-charcoal-300">No bookmarks yet</p>
                        </div>
                    {:else}
                        <div class="space-y-2">
                            {#each $bookmarks as bm (bm.id)}
                                <div class="group flex items-start justify-between gap-3 rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3.5 py-3 hover:bg-brand-gold-50 dark:hover:bg-[#414559] transition-colors">
                                    <div class="min-w-0 flex-1">
                                        <p class="text-[11px] font-semibold text-brand-charcoal-900">
                                            {surahName(bm.surah)} · Ayah {bm.ayah}
                                        </p>
                                        {#if bm.note}
                                            <p class="mt-0.5 text-[11px] text-brand-charcoal-500 line-clamp-2">{bm.note}</p>
                                        {/if}
                                        <p class="mt-1 text-[11px] text-brand-charcoal-300">{formatDate(bm.created_at)}</p>
                                    </div>
                                    <div class="flex shrink-0 items-center gap-1 pt-0.5">
                                        <button
                                            onclick={() => navigate(bm.surah, bm.ayah)}
                                            class="cursor-pointer flex items-center gap-1 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 transition-colors"
                                        >
                                            <Icon icon="solar:arrow-right-up-linear" width="0.7rem" />
                                            Go
                                        </button>
                                        <button
                                            onclick={() => deleteBookmark(bm.id)}
                                            class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg text-brand-charcoal-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-400 active:bg-red-100 dark:active:bg-red-900/50 transition-colors"
                                            title="Delete"
                                        >
                                            <Icon icon="solar:trash-bin-minimalistic-bold" width="0.75rem" />
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
    </div>
{/if}
