<script lang="ts">
    import Icon from '@iconify/svelte';
    import {
        loadBookmarks, addBookmark, deleteBookmark,
        loadLastRead, formatDate,
    } from '$lib/functions/bookmarks';
    import { bookmarks, lastRead, currentReadingAyah, pendingJumpAyah } from '$lib/stores/bookmarks.store';
    import { surahLabels, selectedSurahIdx } from '$lib/stores/quran.svelte';

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
        onClose();
    }
</script>

{#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-brand-charcoal-900/40 backdrop-blur-sm"
        onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
        <div class="flex w-full max-w-md flex-col rounded-2xl bg-white dark:bg-[#303446] shadow-2xl overflow-hidden" style="max-height: 85vh;">

            <!-- Header -->
            <div class="shrink-0 bg-brand-sand-50 border-b border-brand-sand-200 px-5 py-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-sand-100 border border-brand-sand-200">
                            <Icon icon="solar:bookmark-bold-duotone" class="text-brand-gold-500" width="1rem" />
                        </div>
                        <div>
                            <h2 class="text-sm font-semibold text-brand-charcoal-900">Bookmarks</h2>
                            <p class="text-[11px] text-brand-charcoal-300">{$bookmarks.length} saved</p>
                        </div>
                    </div>
                    <button
                        onclick={onClose}
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-sand-100 border border-brand-sand-200 text-brand-charcoal-400 hover:bg-brand-sand-200 transition-colors"
                    >
                        <Icon icon="solar:close-circle-bold" width="1rem" />
                    </button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto bg-brand-sand-50">

                <!-- Add bookmark -->
                <div class="px-5 py-4 border-b border-brand-sand-200">
                    <p class="mb-3 text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300">Add Bookmark</p>

                    <!-- Surah + Ayah row -->
                    <div class="mb-3 flex items-center gap-2">
                        <div class="flex flex-1 items-center gap-2 rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3 py-2">
                            <Icon icon="solar:book-bold-duotone" class="shrink-0 text-brand-gold-400" width="0.85rem" />
                            <span class="text-xs font-medium text-brand-charcoal-900 truncate">{surahName($selectedSurahIdx)}</span>
                        </div>
                        <div class="flex items-center gap-2 rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3 py-2">
                            <label for="bm-ayah" class="text-xs text-brand-charcoal-300 shrink-0">Ayah</label>
                            <input
                                id="bm-ayah"
                                type="number"
                                min="1"
                                bind:value={ayahInput}
                                class="w-14 bg-transparent text-xs font-semibold text-brand-charcoal-900 focus:outline-none"
                            />
                        </div>
                    </div>

                    <textarea
                        placeholder="Add a note… (optional)"
                        bind:value={noteInput}
                        rows="2"
                        class="mb-3 w-full resize-none rounded-xl border border-brand-sand-200 bg-brand-sand-50/80 px-3 py-2.5 text-xs text-brand-charcoal-900 placeholder-brand-charcoal-300 focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 hover:border-brand-sand-400 hover:bg-brand-sand-100 transition-all"
                    ></textarea>

                    {#if saveError}
                        <p class="mb-2 flex items-center gap-1 text-xs text-red-500">
                            <Icon icon="solar:danger-circle-bold" width="0.75rem" />{saveError}
                        </p>
                    {/if}

                    <button
                        onclick={handleAdd}
                        disabled={saving}
                        class="cursor-pointer flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-gold-400 py-2 text-xs font-semibold text-white hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
                    >
                        <Icon icon="solar:bookmark-bold" width="0.8rem" />
                        {saving ? 'Saving…' : 'Save Bookmark'}
                    </button>
                </div>

                <!-- Last read -->
                {#if $lastRead}
                    <div class="px-5 py-4 border-b border-brand-sand-200">
                        <p class="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300">Continue Reading</p>
                        <div class="flex items-center justify-between rounded-xl bg-brand-sand-100 border border-brand-sand-200 px-4 py-3">
                            <div class="flex items-center gap-2.5">
                                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-sand-100 border border-brand-sand-200">
                                    <Icon icon="solar:book-bookmark-bold-duotone" class="text-brand-gold-500" width="1rem" />
                                </div>
                                <div>
                                    <p class="text-xs font-semibold text-brand-charcoal-900">
                                        {surahName($lastRead.surah)} · Ayah {$lastRead.ayah}
                                    </p>
                                    <p class="text-[10px] text-brand-charcoal-300">{formatDate($lastRead.updated_at)}</p>
                                </div>
                            </div>
                            <button
                                onclick={() => navigate($lastRead!.surah, $lastRead!.ayah)}
                                class="cursor-pointer flex items-center gap-1 rounded-lg bg-brand-gold-400 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-gold-600 active:bg-brand-gold-600/90 transition-colors"
                            >
                                <Icon icon="solar:arrow-right-up-linear" width="0.7rem" />
                                Go
                            </button>
                        </div>
                    </div>
                {/if}

                <!-- Saved bookmarks -->
                <div class="px-5 py-4">
                    <p class="mb-3 text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300">
                        Saved{$bookmarks.length ? ` · ${$bookmarks.length}` : ''}
                    </p>

                    {#if $bookmarks.length === 0}
                        <div class="flex flex-col items-center gap-2 py-8 text-center">
                            <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-sand-100">
                                <Icon icon="solar:bookmark-bold-duotone" class="text-brand-sand-400" width="1.5rem" />
                            </div>
                            <p class="text-xs text-brand-charcoal-300">No bookmarks yet</p>
                        </div>
                    {:else}
                        <div class="space-y-2">
                            {#each $bookmarks as bm (bm.id)}
                                <div class="group flex items-start justify-between gap-3 rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3.5 py-3 hover:bg-brand-gold-50 transition-colors">
                                    <div class="min-w-0 flex-1">
                                        <p class="text-xs font-semibold text-brand-charcoal-900">
                                            {surahName(bm.surah)} · Ayah {bm.ayah}
                                        </p>
                                        {#if bm.note}
                                            <p class="mt-0.5 text-[11px] text-brand-charcoal-500 line-clamp-2">{bm.note}</p>
                                        {/if}
                                        <p class="mt-1 text-[10px] text-brand-charcoal-300">{formatDate(bm.created_at)}</p>
                                    </div>
                                    <div class="flex shrink-0 items-center gap-1 pt-0.5">
                                        <button
                                            onclick={() => navigate(bm.surah, bm.ayah)}
                                            class="cursor-pointer flex items-center gap-1 rounded-lg bg-white border border-brand-sand-200 px-2.5 py-1 text-[11px] font-medium text-brand-charcoal-500 hover:bg-brand-gold-100 active:bg-brand-gold-200 transition-colors"
                                        >
                                            <Icon icon="solar:arrow-right-up-linear" width="0.7rem" />
                                            Go
                                        </button>
                                        <button
                                            onclick={() => deleteBookmark(bm.id)}
                                            class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg text-brand-charcoal-300 hover:bg-red-50 hover:text-red-400 active:bg-red-100 transition-colors"
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
    </div>
{/if}
