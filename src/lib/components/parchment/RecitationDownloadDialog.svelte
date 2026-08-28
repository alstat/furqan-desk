<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { t } from "$lib/i18n";
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import Icon from "@iconify/svelte";
    import { fade, fly } from "svelte/transition";
    import { onMount, onDestroy } from "svelte";
    import { selectedSurahIdx } from "$lib/stores/quran.svelte";
    import {
        activeReciterId,
        currentPlayingAyah,
        downloadedSurahs,
        isDownloading,
        downloadProgress,
        selectedReciterSlots,
        availableReciters,
        type DownloadProgress,
        type ReciterInfo,
    } from "$lib/stores/recitation.store";

    interface Props {
        open: boolean;
        onClose: () => void;
    }
    let { open, onClose }: Props = $props();

    let dialogReciterId = $state<number>($activeReciterId);
    const downloadedCounts = $derived(
        Object.fromEntries(
            $selectedReciterSlots.map((id: number) => [
                id,
                $downloadedSurahs[id]?.length ?? 0,
            ]),
        ) as Record<number, number>,
    );
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
            const results = await Promise.all(
                $selectedReciterSlots.map((id: number) =>
                    invoke<number[]>("get_downloaded_surahs", {
                        reciterId: id,
                    }),
                ),
            );
            const counts: Record<number, number[]> = { ...$downloadedSurahs };
            $selectedReciterSlots.forEach((id: number, i: number) => {
                counts[id] = results[i];
            });
            downloadedSurahs.set(counts);
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

    async function startDownload(
        surahFilter: number | null,
        ayahFilter: number | null,
    ) {
        isDownloading.set(true);
        downloadProgress.set(null);
        try {
            await invoke("download_recitation", {
                reciterId: dialogReciterId,
                surahFilter,
                ayahFilter,
            });
            onClose();
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
        onClose();
    }

    let progressPct = $derived(
        $downloadProgress && $downloadProgress.total > 0
            ? ($downloadProgress.downloaded / $downloadProgress.total) * 100
            : 0,
    );

    const dialogReciterInfo = $derived(
        $availableReciters.find((r: ReciterInfo) => r.id === dialogReciterId),
    );
    const isSeekReciter = $derived(dialogReciterInfo?.style === "seek");
</script>

{#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        transition:fade={{ duration: 150 }}
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onclick={(e) => {
            if (e.target === e.currentTarget) handleClose();
        }}
        onkeydown={(e) => {
            if (e.key === "Escape") handleClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recitation-dl-title"
        tabindex="-1"
    >
        <div
            transition:fly={{ y: 8, duration: 180, opacity: 0 }}
            class="flex w-full max-w-sm flex-col rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
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
                                id="recitation-dl-title"
                                class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                            >
                                {$t("recitation_dl.title")}
                            </h2>
                            <p
                                class="text-[0.6875rem] text-brand-charcoal-300 dark:text-[#838ba7]"
                            >
                                {$t("recitation_dl.subtitle")}
                            </p>
                        </div>
                    </div>
                    <button
                        onclick={handleClose}
                        aria-label={$t("common.close")}
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    >
                        <Icon icon="solar:close-circle-bold" width="1rem" />
                    </button>
                </div>

                <!-- Reciter tabs — rendered from selectedReciterSlots -->
                <div
                    class="mx-4 mb-2 flex gap-1 rounded-full bg-brand-gold-200/50 dark:bg-[#414559]/50 p-1"
                >
                    {#each $selectedReciterSlots as slotId (slotId)}
                        {@const info = $availableReciters.find(
                            (r: ReciterInfo) => r.id === slotId,
                        )}
                        <button
                            onclick={() => (dialogReciterId = slotId)}
                            disabled={$isDownloading}
                            class={`flex-1 cursor-pointer flex items-center justify-center gap-1.5 rounded-full py-1 text-[0.6875rem] font-semibold transition-colors disabled:cursor-not-allowed ${
                                dialogReciterId === slotId
                                    ? "bg-white dark:bg-[#303446] text-brand-charcoal-900 dark:text-[#c6d0f5] shadow-sm"
                                    : "text-brand-gold-600 dark:text-[#838ba7] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
                            }`}
                        >
                            <Icon icon="solar:play-bold" width="0.75rem" />
                            {info?.short_name ?? String(slotId)}
                            <span class="opacity-60"
                                >({downloadedCounts[slotId] ?? 0}/114)</span
                            >
                        </button>
                    {/each}
                </div>
            </div>

            <div class="px-5 py-5 space-y-4 bg-brand-sand-50 dark:bg-[#232634]">
                <!-- Action buttons -->
                <div class="space-y-2">
                    {#if !isSeekReciter}
                        <!-- Ayah-style: per-ayah download -->
                        <button
                            onclick={() =>
                                startDownload(
                                    $selectedSurahIdx,
                                    $currentPlayingAyah ?? 1,
                                )}
                            disabled={$isDownloading}
                            class="cursor-pointer flex w-full items-center justify-center gap-2 rounded-full border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#292c3c] py-1.5 text-[0.6875rem] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5] hover:bg-brand-gold-50 dark:hover:bg-[#3b3757] hover:border-brand-gold-200 dark:hover:border-[#51576d] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            <Icon
                                icon="solar:download-minimalistic-bold"
                                width="0.9rem"
                                class="text-brand-gold-500"
                            />
                            {$t("recitation_dl.current_ayah")}
                        </button>
                    {/if}
                    <button
                        onclick={() => startDownload($selectedSurahIdx, null)}
                        disabled={$isDownloading}
                        class="cursor-pointer flex w-full items-center justify-center gap-2 rounded-full border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#292c3c] py-1.5 text-[0.6875rem] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5] hover:bg-brand-gold-50 dark:hover:bg-[#3b3757] hover:border-brand-gold-200 dark:hover:border-[#51576d] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        <Icon
                            icon="solar:download-minimalistic-bold"
                            width="0.9rem"
                            class="text-brand-gold-500"
                        />
                        {$t("recitation_dl.current_surah")}
                    </button>
                    <button
                        onclick={() => startDownload(null, null)}
                        disabled={$isDownloading}
                        class="cursor-pointer flex w-full items-center justify-center gap-2 rounded-full bg-brand-gold-400 py-1.5 text-[0.6875rem] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Icon
                            icon="solar:download-twice-square-bold-duotone"
                            width="0.9rem"
                        />
                        {$t("recitation_dl.all_surahs")}
                    </button>
                </div>

                <!-- Progress section -->
                {#if $isDownloading || $downloadProgress}
                    <div class="space-y-2">
                        <div class="flex items-center justify-between">
                            <p
                                class="text-[0.6875rem] text-brand-charcoal-500 dark:text-[#838ba7]"
                            >
                                {#if $downloadProgress && !$downloadProgress.done}
                                    {#if isSeekReciter}
                                        {$t("recitation_dl.progress_surah", {
                                            surah: String(
                                                $downloadProgress.surah,
                                            ),
                                            total:
                                                $downloadProgress.total > 0
                                                    ? String(
                                                          $downloadProgress.total,
                                                      )
                                                    : "…",
                                        })}
                                    {:else}
                                        {$t("recitation_dl.progress", {
                                            surah: String(
                                                $downloadProgress.surah,
                                            ),
                                            ayah: String(
                                                $downloadProgress.ayah,
                                            ),
                                            total:
                                                $downloadProgress.total > 0
                                                    ? String(
                                                          $downloadProgress.total,
                                                      )
                                                    : "…",
                                        })}
                                    {/if}
                                {:else if $downloadProgress?.done}
                                    {#if isSeekReciter}
                                        {$t("recitation_dl.complete_surah", {
                                            downloaded: String(
                                                $downloadProgress.downloaded,
                                            ),
                                        })}
                                    {:else}
                                        {$t("recitation_dl.complete", {
                                            downloaded: String(
                                                $downloadProgress.downloaded,
                                            ),
                                        })}
                                    {/if}
                                {:else}
                                    {$t("recitation_dl.starting")}
                                {/if}
                            </p>
                            <p
                                class="text-[0.6875rem] font-medium text-brand-charcoal-900 dark:text-[#c6d0f5] tabular-nums"
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
                                class="cursor-pointer flex w-full items-center justify-center gap-1.5 rounded-full border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 py-1.5 text-[0.6875rem] font-medium text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            >
                                <Icon
                                    icon="solar:stop-circle-bold"
                                    width="0.9rem"
                                />
                                {$t("recitation_dl.cancel")}
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
