<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import Icon from "@iconify/svelte";
    import { onMount } from "svelte";
    import { selectedSurahIdx } from "$lib/stores/quran.svelte";
    import {
        activeReciterId,
        currentPlayingAyah,
        isPlaying,
        totalAyahsInSurah,
        requestPlayAyah,
        downloadedSurahs,
        isDownloading,
        downloadProgress,
    } from "$lib/stores/recitation.store";
    import RecitationDownloadDialog from "./RecitationDownloadDialog.svelte";

    let { scrollContainer }: { scrollContainer: HTMLElement | null } = $props();

    let audioEl = $state<HTMLAudioElement | null>(null);
    let noInternetToast = $state(false);
    let toastTimer: ReturnType<typeof setTimeout> | null = null;
    let showDownloadDialog = $state(false);
    // Tracks whether the currently loaded audio is a local file (not network)
    let isCurrentLocal = $state(false);
    // Blob URL for the current local audio file; revoked when moving to the next ayah
    let currentBlobUrl: string | null = null;

    function revokeBlobUrl() {
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }
    }

    let currentSurahDownloaded = $derived(
        $downloadedSurahs[$activeReciterId]?.includes($selectedSurahIdx) ?? false
    );

    // Populate downloaded-surahs store on startup so the button state is correct immediately
    onMount(async () => {
        try {
            const [s953, s954] = await Promise.all([
                invoke<number[]>("get_downloaded_surahs", { reciterId: 953 }),
                invoke<number[]>("get_downloaded_surahs", { reciterId: 954 }),
            ]);
            downloadedSurahs.set({ 953: s953, 954: s954 });
        } catch (e) {
            console.error("Failed to fetch downloaded surahs:", e);
        }
    });

    function showNetworkError() {
        noInternetToast = true;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (noInternetToast = false), 4000);
    }

    function handleAudioError() {
        // Never show the "no internet" toast when playing a local file —
        // local audio errors are unrelated to network connectivity.
        if (isCurrentLocal) return;
        // MEDIA_ERR_NETWORK = 2; also catch any error when the device is offline
        const code = audioEl?.error?.code;
        if (code === 2 || !navigator.onLine) {
            isPlaying.set(false);
            showNetworkError();
        }
    }

    // Reset player when surah changes
    $effect(() => {
        $selectedSurahIdx; // track
        stopAndReset();
    });

    function stopAndReset() {
        revokeBlobUrl();
        if (audioEl) {
            audioEl.pause();
            audioEl.src = "";
            audioEl.load(); // exits the error/aborted state so the element is ready for next play
        }
        currentPlayingAyah.set(null);
        isPlaying.set(false);
        isCurrentLocal = false;
    }

    async function playAyah(ayahNum: number) {
        if (!audioEl) return;
        const surah = $selectedSurahIdx;
        const reciterId = $activeReciterId;

        try {
            const result = await invoke<{
                audio_url: string;
                duration: number | null;
                segments: string | null;
                is_local: boolean;
            } | null>("get_recitation_ayah", {
                surah,
                ayah: ayahNum,
                reciterId,
            });

            if (!result) return;

            isCurrentLocal = result.is_local;
            revokeBlobUrl();

            if (result.is_local) {
                // Read the file bytes via IPC and create a blob: URL —
                // avoids the asset:// protocol and its CSP/scope restrictions.
                const bytes = await invoke<number[]>("read_audio_bytes", {
                    path: result.audio_url,
                });
                const blob = new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" });
                currentBlobUrl = URL.createObjectURL(blob);
                audioEl.src = currentBlobUrl;
            } else {
                audioEl.src = result.audio_url;
            }
            audioEl.load();
            currentPlayingAyah.set(ayahNum);
            isPlaying.set(true);
            await audioEl.play();
        } catch (e: unknown) {
            // Ignore AbortError — happens when a new play() interrupts a pending one
            if (e instanceof DOMException && e.name === "AbortError") return;
            isPlaying.set(false);
            if (!isCurrentLocal && !navigator.onLine) {
                showNetworkError();
            } else if (!isCurrentLocal) {
                console.error("Failed to play recitation:", e);
            }
        }
    }

    // Refresh downloaded surahs after a download completes
    $effect(() => {
        const p = $downloadProgress;
        if (p?.done) {
            invoke<number[]>("get_downloaded_surahs", { reciterId: p.reciter_id }).then(
                (surahs) => {
                    downloadedSurahs.update((prev) => ({
                        ...prev,
                        [p.reciter_id]: surahs,
                    }));
                }
            );
        }
    });

    // Watch for external play requests (e.g. clicking a verse number)
    $effect(() => {
        const n = $requestPlayAyah;
        if (n === null) return;
        requestPlayAyah.set(null);
        playAyah(n);
    });

    function handleEnded() {
        const next = ($currentPlayingAyah ?? 0) + 1;
        if (next <= $totalAyahsInSurah) {
            playAyah(next);
        } else {
            isPlaying.set(false);
            currentPlayingAyah.set(null);
        }
    }

    function togglePlay() {
        if (!audioEl) return;
        if ($isPlaying) {
            audioEl.pause();
            isPlaying.set(false);
        } else {
            if ($currentPlayingAyah !== null) {
                audioEl.play();
                isPlaying.set(true);
            } else {
                playAyah(1);
            }
        }
    }

    function prevAyah() {
        const cur = $currentPlayingAyah ?? 1;
        if (cur > 1) playAyah(cur - 1);
    }

    function nextAyah() {
        const cur = $currentPlayingAyah ?? 0;
        if (cur < $totalAyahsInSurah) playAyah(cur + 1);
    }

    // Highlight and auto-scroll when current ayah changes
    $effect(() => {
        const ayah = $currentPlayingAyah;

        // Remove previous highlights
        document
            .querySelectorAll(".ayah-playing")
            .forEach((el) => el.classList.remove("ayah-playing"));

        if (ayah === null) return;

        const elements = document.querySelectorAll<HTMLElement>(
            `[data-ayah="${ayah}"], #ayah-${ayah}`
        );
        elements.forEach((el) => el.classList.add("ayah-playing"));

        // Auto-scroll if ayah is near bottom 20% of viewport
        if (scrollContainer) {
            const anchor = scrollContainer.querySelector(`#ayah-${ayah}`);
            if (anchor) {
                const rect = anchor.getBoundingClientRect();
                const containerRect = scrollContainer.getBoundingClientRect();
                const threshold = containerRect.bottom - containerRect.height * 0.2;
                if (rect.bottom > threshold) {
                    anchor.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }
        }
    });

    function setReciter(id: 953 | 954) {
        if (id === $activeReciterId) return;
        const ayah = $currentPlayingAyah;
        const wasPlaying = $isPlaying;
        if (audioEl) {
            audioEl.pause();
            // Do NOT clear audioEl.src here — setting it to "" puts Chromium into
            // an aborted state that survives a subsequent load(), causing play() to
            // throw NotSupportedError. playAyah() overwrites the src itself.
        }
        revokeBlobUrl();
        isCurrentLocal = false;
        isPlaying.set(false);
        activeReciterId.set(id);
        if (ayah !== null && wasPlaying) {
            playAyah(ayah);
        }
    }
</script>

<div class="flex flex-col items-center gap-2">
    <!-- No internet toast -->
    {#if noInternetToast}
        <div
            class="flex items-center gap-2 px-3 py-2
                   rounded-2xl
                   bg-white/90 dark:bg-[#292c3c]/95
                   backdrop-blur-md
                   border border-red-200/80 dark:border-red-900/50
                   shadow-lg shadow-stone-300/30 dark:shadow-black/40
                   text-xs text-red-500 dark:text-red-400
                   select-none"
        >
            <Icon icon="solar:wifi-router-minimalistic-bold-duotone" width="1rem" class="shrink-0" />
            Internet connection required to stream recitation.
        </div>
    {/if}

    <!-- Floating player pill -->
    <div
        class="flex items-center gap-1 px-2 py-1.5
               rounded-2xl
               bg-white/80 dark:bg-[#292c3c]/85
               backdrop-blur-md
               border border-stone-200/70 dark:border-[#414559]/60
               shadow-lg shadow-stone-300/30 dark:shadow-black/40
               text-sm select-none"
    >
        <!-- Prev -->
        <button
            onclick={prevAyah}
            disabled={!$currentPlayingAyah || $currentPlayingAyah <= 1}
            aria-label="Previous ayah"
            class="cursor-pointer p-1.5 rounded-xl text-brand-charcoal-500 dark:text-[#838ba7]
                   hover:bg-brand-sand-100 dark:hover:bg-[#414559]/60
                   hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]
                   disabled:opacity-25 disabled:cursor-not-allowed transition-all"
        >
            <Icon icon="solar:skip-previous-bold" width="1rem" />
        </button>

        <!-- Play/Pause — slightly larger, gold accent -->
        <button
            onclick={togglePlay}
            aria-label={$isPlaying ? "Pause" : "Play"}
            class="cursor-pointer p-1.5 rounded-xl
                   text-brand-gold-600 dark:text-[#e5c890]
                   hover:bg-brand-gold-50 dark:hover:bg-[#3b3757]
                   transition-all"
        >
            <Icon
                icon={$isPlaying ? "solar:pause-circle-bold-duotone" : "solar:play-circle-bold-duotone"}
                width="1.5rem"
            />
        </button>

        <!-- Next -->
        <button
            onclick={nextAyah}
            disabled={$currentPlayingAyah !== null && $currentPlayingAyah >= $totalAyahsInSurah}
            aria-label="Next ayah"
            class="cursor-pointer p-1.5 rounded-xl text-brand-charcoal-500 dark:text-[#838ba7]
                   hover:bg-brand-sand-100 dark:hover:bg-[#414559]/60
                   hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]
                   disabled:opacity-25 disabled:cursor-not-allowed transition-all"
        >
            <Icon icon="solar:skip-next-bold" width="1rem" />
        </button>

        <!-- Divider -->
        <div class="w-px h-4 bg-stone-200 dark:bg-[#414559] mx-0.5 shrink-0"></div>

        <!-- Ayah counter -->
        <span class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] tabular-nums px-1 min-w-[3.5rem] text-center">
            {$currentPlayingAyah ?? 1} / {$totalAyahsInSurah}
        </span>

        <!-- Divider -->
        <div class="w-px h-4 bg-stone-200 dark:bg-[#414559] mx-0.5 shrink-0"></div>

        <!-- Download / spinner — only rendered when relevant; trailing divider included -->
        {#if $isDownloading || !currentSurahDownloaded}
            {#if $isDownloading}
                <div class="p-1.5 text-brand-gold-500 dark:text-[#e5c890]" title="Downloading…">
                    <Icon icon="solar:refresh-bold-duotone" width="1rem" class="animate-spin" />
                </div>
            {:else}
                <button
                    onclick={() => (showDownloadDialog = true)}
                    aria-label="Download recitation"
                    class="cursor-pointer p-1.5 rounded-xl text-brand-charcoal-500 dark:text-[#838ba7]
                           hover:bg-brand-sand-100 dark:hover:bg-[#414559]/60
                           hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]
                           transition-all"
                >
                    <Icon icon="solar:download-minimalistic-bold" width="1rem" />
                </button>
            {/if}
            <div class="w-px h-4 bg-stone-200 dark:bg-[#414559] mx-0.5 shrink-0"></div>
        {/if}

        <!-- Reciter toggle -->
        <div class="flex items-center gap-0.5 px-0.5">
            <button
                onclick={() => setReciter(953)}
                class={`cursor-pointer px-2 py-0.5 rounded-lg text-xs font-medium transition-all ${
                    $activeReciterId === 953
                        ? "bg-brand-gold-100 dark:bg-[#3b3757] text-brand-gold-600 dark:text-[#e5c890]"
                        : "text-brand-charcoal-300 dark:text-[#626880] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
                }`}
            >
                Mishary
            </button>
            <button
                onclick={() => setReciter(954)}
                class={`cursor-pointer px-2 py-0.5 rounded-lg text-xs font-medium transition-all ${
                    $activeReciterId === 954
                        ? "bg-brand-gold-100 dark:bg-[#3b3757] text-brand-gold-600 dark:text-[#e5c890]"
                        : "text-brand-charcoal-300 dark:text-[#626880] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
                }`}
            >
                Saad
            </button>
        </div>
    </div>
</div>

<!-- Hidden audio element -->
<audio bind:this={audioEl} onended={handleEnded} onerror={handleAudioError} preload="none"></audio>

{#if showDownloadDialog}
    <RecitationDownloadDialog
        open={showDownloadDialog}
        onClose={() => (showDownloadDialog = false)}
    />
{/if}
