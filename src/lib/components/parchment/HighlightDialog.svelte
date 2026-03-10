<script lang="ts">
    import Icon from '@iconify/svelte';
    import { loadHighlights, deleteHighlight, formatDate } from '$lib/functions/bookmarks';
    import { highlights, pendingJumpAyah } from '$lib/stores/bookmarks.store';
    import { surahLabels, selectedSurahIdx } from '$lib/stores/quran.svelte';

    interface Props { open: boolean; onClose: () => void; }
    let { open, onClose }: Props = $props();

    $effect(() => { if (open) loadHighlights(); });

    function surahName(n: number): string {
        return $surahLabels[n - 1]?.en ?? `Surah ${n}`;
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
                            <Icon icon="solar:magic-stick-3-bold-duotone" class="text-brand-gold-500" width="1rem" />
                        </div>
                        <div>
                            <h2 class="text-sm font-semibold text-brand-charcoal-900">Highlights</h2>
                            <p class="text-[11px] text-brand-charcoal-300">{$highlights.length} saved</p>
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

            <!-- List -->
            <div class="flex-1 overflow-y-auto bg-brand-sand-50">
                {#if $highlights.length === 0}
                    <div class="flex flex-col items-center gap-3 py-16 text-center px-6">
                        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-sand-100">
                            <Icon icon="solar:magic-stick-3-bold-duotone" class="text-brand-sand-400" width="1.75rem" />
                        </div>
                        <div>
                            <p class="text-sm font-medium text-brand-charcoal-500">No highlights yet</p>
                            <p class="mt-1 text-xs text-brand-charcoal-300">Select text in the parchment and tap<br/>"Save Highlight" to capture it here.</p>
                        </div>
                    </div>
                {:else}
                    <div class="divide-y divide-brand-sand-200">
                        {#each $highlights as hl (hl.id)}
                            <div class="group px-5 py-3.5 hover:bg-brand-gold-50 transition-colors">
                                <!-- Arabic text -->
                                <p class="mb-2.5 font-scheherazade text-xl leading-loose text-brand-charcoal-900 break-words overflow-hidden" dir="rtl">
                                    {hl.text}
                                </p>
                                <!-- Footer row -->
                                <div class="flex items-center justify-between gap-2">
                                    <div class="flex items-center gap-1.5 min-w-0">
                                        <span class="inline-flex items-center gap-1 rounded-md bg-brand-gold-100 border border-brand-gold-200 px-2 py-0.5 text-[10px] font-medium text-brand-gold-600 shrink-0">
                                            <Icon icon="solar:book-bold" width="0.65rem" />
                                            {surahName(hl.surah)} · {hl.ayah}
                                        </span>
                                        <span class="text-[10px] text-brand-charcoal-300 truncate">{formatDate(hl.created_at)}</span>
                                    </div>
                                    <div class="flex shrink-0 items-center gap-1">
                                        <button
                                            onclick={() => navigate(hl.surah, hl.ayah)}
                                            class="cursor-pointer flex items-center gap-1 rounded-lg bg-white border border-brand-sand-200 px-2.5 py-1 text-[11px] font-medium text-brand-charcoal-500 hover:bg-brand-gold-100 active:bg-brand-gold-200 transition-colors"
                                        >
                                            <Icon icon="solar:arrow-right-up-linear" width="0.7rem" />
                                            Go
                                        </button>
                                        <button
                                            onclick={() => deleteHighlight(hl.id)}
                                            class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg text-brand-charcoal-300 hover:bg-red-50 hover:text-red-400 active:bg-red-100 transition-colors"
                                            title="Delete"
                                        >
                                            <Icon icon="solar:trash-bin-minimalistic-bold" width="0.75rem" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
