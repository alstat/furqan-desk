<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import Icon from "@iconify/svelte";
    import { onMount, onDestroy } from "svelte";
    import { selectedSurahIdx } from "$lib/stores/quran.svelte";
    import {
        activeReciterId,
        downloadedSurahs,
        isDownloading,
        downloadProgress,
        type DownloadProgress,
    } from "$lib/stores/recitation.store";

    interface Props {
        open: boolean;
        onClose: () => void;
    }
    let { open, onClose }: Props = $props();

    let dialogReciterId = $state<953 | 954>($activeReciterId);
    let downloadedCount953 = $state(0);
    let downloadedCount954 = $state(0);
    let unlisten: UnlistenFn | null = null;

    $effect(() => {
        if (open) {
            dialogReciterId = $activeReciterId;
            downloadProgress.set(null);
            refreshCounts();
        }
    });

    async function refreshCounts() {
        try {
            const [c953, c954] = await Promise.all([
                invoke<number[]>("get_downloaded_surahs", { reciterId: 953 }),
                invoke<number[]>("get_downloaded_surahs", { reciterId: 954 }),
            ]);
            downloadedSurahs.update((prev) => ({
                ...prev,
                953: c953,
                954: c954,
            }));
            downloadedCount953 = c953.length;
            downloadedCount954 = c954.length;
        } catch (e) {
            console.error("Failed to get downloaded surahs:", e);
        }
    }

    onMount(async () => {
        unlisten = await listen<DownloadProgress>(
            "recitation-download-progress",
            (event) => {
                const payload = event.payload;
                downloadProgress.set(payload);
                if (payload?.done) {
                    isDownloading.set(false);
                    refreshCounts();
                }
            },
        );
    });

    onDestroy(() => {
        unlisten?.();
    });

    async function startDownload(surahFilter: number | null) {
        isDownloading.set(true);
        downloadProgress.set(null);
        try {
            await invoke("download_recitation", {
                reciterId: dialogReciterId,
                surahFilter,
            });
        } catch (e) {
            console.error("Download failed:", e);
            isDownloading.set(false);
        }
    }

    async function cancelDownload() {
        try {
            await invoke("cancel_recitation_download");
        } catch (e) {
            console.error("Cancel failed:", e);
        }
    }

    function handleClose() {
        if (!$isDownloading) onClose();
    }

    $effect(() => {
        const p = $downloadProgress;
        if (p?.reciter_id === 953)
            downloadedCount953 = $downloadedSurahs[953]?.length ?? 0;
        if (p?.reciter_id === 954)
            downloadedCount954 = $downloadedSurahs[954]?.length ?? 0;
    });

    let progressPct = $derived(
        $downloadProgress && $downloadProgress.total > 0
            ? ($downloadProgress.downloaded / $downloadProgress.total) * 100
            : 0,
    );
</script>

{#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-500 flex items-center justify-center p-4 bg-brand-charcoal-900/40 backdrop-blur-sm"
        onclick={(e) => {
            if (e.target === e.currentTarget) handleClose();
        }}
        onkeydown={(e) => { if (e.key === 'Escape') handleClose(); }}
    >
        <div
            class="flex w-full max-w-sm flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
        >
            <!-- Header -->
            <div
                class="shrink-0 bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559]"
            >
                <!-- Title row -->
                <div class="flex items-center justify-between px-5 py-4">
                    <div class="flex items-center gap-2.5">
                        <div
                            class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gold-200 dark:bg-[#414559]"
                        >
                            <Icon
                                icon="solar:download-minimalistic-bold-duotone"
                                class="text-brand-gold-500"
                                width="1rem"
                            />
                        </div>
                        <div>
                            <h2
                                class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                            >
                                Offline Recitation
                            </h2>
                            <p
                                class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                            >
                                Download for offline playback
                            </p>
                        </div>
                    </div>
                    <button
                        onclick={handleClose}
                        disabled={$isDownloading}
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Icon icon="solar:close-circle-bold" width="1rem" />
                    </button>
                </div>

                <!-- Reciter tabs -->
                <div class="mx-4 mb-2 flex gap-1 rounded-full bg-brand-gold-200/50 dark:bg-[#414559]/50 p-1">
                    <button
                        onclick={() => (dialogReciterId = 953)}
                        disabled={$isDownloading}
                        class={`flex-1 cursor-pointer flex items-center justify-center gap-1.5 rounded-full py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed ${
                            dialogReciterId === 953
                                ? "bg-white dark:bg-[#303446] text-brand-charcoal-900 dark:text-[#c6d0f5] shadow-sm"
                                : "text-brand-gold-600 dark:text-[#838ba7] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
                        }`}
                    >
                        <Icon icon="solar:play-bold" width="0.75rem" />
                        Mishary
                        <span class="opacity-60">({downloadedCount953}/114)</span>
                    </button>
                    <button
                        onclick={() => (dialogReciterId = 954)}
                        disabled={$isDownloading}
                        class={`flex-1 cursor-pointer flex items-center justify-center gap-1.5 rounded-full py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed ${
                            dialogReciterId === 954
                                ? "bg-white dark:bg-[#303446] text-brand-charcoal-900 dark:text-[#c6d0f5] shadow-sm"
                                : "text-brand-gold-600 dark:text-[#838ba7] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
                        }`}
                    >
                        <Icon icon="solar:play-bold" width="0.75rem" />
                        Saad
                        <span class="opacity-60">({downloadedCount954}/114)</span>
                    </button>
                </div>
            </div>

            <div class="px-5 py-4 space-y-4 bg-brand-sand-50 dark:bg-[#232634]">
                <!-- Action buttons -->
                <div class="space-y-2">
                    <button
                        onclick={() => startDownload($selectedSurahIdx)}
                        disabled={$isDownloading}
                        class="cursor-pointer flex w-full items-center justify-center gap-2 rounded-full border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#292c3c] py-2 text-[11px] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5] hover:bg-brand-gold-50 dark:hover:bg-[#3b3757] hover:border-brand-gold-200 dark:hover:border-[#51576d] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        <Icon
                            icon="solar:download-minimalistic-bold"
                            width="0.9rem"
                            class="text-brand-gold-500"
                        />
                        Download Current Surah
                    </button>
                    <button
                        onclick={() => startDownload(null)}
                        disabled={$isDownloading}
                        class="cursor-pointer flex w-full items-center justify-center gap-2 rounded-full bg-brand-gold-400 py-2 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Icon
                            icon="solar:download-twice-square-bold-duotone"
                            width="0.9rem"
                        />
                        Download All Surahs
                    </button>
                </div>

                <!-- Progress section -->
                {#if $isDownloading || $downloadProgress}
                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <p
                                class="text-[11px] text-brand-charcoal-500 dark:text-[#838ba7]"
                            >
                                {#if $downloadProgress && !$downloadProgress.done}
                                    Surah {$downloadProgress.surah} — ayah {$downloadProgress.ayah}
                                    / {$downloadProgress.total > 0
                                        ? Math.round(
                                              ($downloadProgress.downloaded /
                                                  $downloadProgress.total) *
                                                  ($downloadProgress.surah > 0
                                                      ? 1
                                                      : 1),
                                          )
                                        : "…"}
                                {:else if $downloadProgress?.done}
                                    Complete — {$downloadProgress.downloaded} ayahs
                                    downloaded
                                {:else}
                                    Starting download…
                                {/if}
                            </p>
                            <p
                                class="text-[11px] font-medium text-brand-charcoal-900 dark:text-[#c6d0f5] tabular-nums"
                            >
                                {$downloadProgress
                                    ? `${$downloadProgress.downloaded}/${$downloadProgress.total}`
                                    : ""}
                            </p>
                        </div>

                        <div
                            class="h-2 w-full overflow-hidden rounded-full bg-brand-sand-200 dark:bg-[#414559]"
                        >
                            <div
                                class="h-full rounded-full bg-brand-gold-400 dark:bg-[#e5c890] transition-all duration-300"
                                style="width: {progressPct}%"
                            ></div>
                        </div>

                        {#if $isDownloading}
                            <button
                                onclick={cancelDownload}
                                class="cursor-pointer flex w-full items-center justify-center gap-1.5 rounded-full border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 py-2 text-[11px] font-medium text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            >
                                <Icon
                                    icon="solar:stop-circle-bold"
                                    width="0.9rem"
                                />
                                Cancel
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
