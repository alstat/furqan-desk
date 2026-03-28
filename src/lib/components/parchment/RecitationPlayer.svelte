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
        recitationPlaylist,
        requestPlayPosition,
        requestPlayBasmallah,
        recitationDownloadDialogOpen,
    } from "$lib/stores/recitation.store";

    let { scrollContainer }: { scrollContainer: HTMLElement | null } = $props();

    let audioEl = $state<HTMLAudioElement | null>(null);
    let noInternetToast = $state(false);
    let toastTimer: ReturnType<typeof setTimeout> | null = null;
    // Tracks whether the currently loaded audio is a local file (not network)
    let isCurrentLocal = $state(false);
    let isPlayingBasmallah = $state(false);
    // Blob URL for the current local audio file; revoked when moving to the next ayah
    let currentBlobUrl: string | null = null;
    // Playlist mode state
    let playlistIdx = $state(0);
    let currentPlayingSurah = $state<number | null>(null);
    const inPlaylist = $derived($recitationPlaylist !== null);
    const playlistLen = $derived($recitationPlaylist?.length ?? 0);

    function revokeBlobUrl() {
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }
    }

    let currentSurahDownloaded = $derived(
        $downloadedSurahs[$activeReciterId]?.includes($selectedSurahIdx) ??
            false,
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
        playlistIdx = 0;
        currentPlayingSurah = null;
    }

    async function playAyahOfSurah(
        surah: number,
        ayahNum: number,
        displayAyah?: number,
    ) {
        if (!audioEl) return;
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
                const bytes = await invoke<number[]>("read_audio_bytes", {
                    path: result.audio_url,
                });
                const blob = new Blob([new Uint8Array(bytes)], {
                    type: "audio/mpeg",
                });
                currentBlobUrl = URL.createObjectURL(blob);
                audioEl.src = currentBlobUrl;
            } else {
                audioEl.src = result.audio_url;
            }
            audioEl.load();
            currentPlayingAyah.set(displayAyah ?? ayahNum);
            isPlaying.set(true);
            await audioEl.play();
        } catch (e: unknown) {
            if (e instanceof DOMException && e.name === "AbortError") return;
            isPlaying.set(false);
            if (!isCurrentLocal && !navigator.onLine) {
                showNetworkError();
            } else if (!isCurrentLocal) {
                console.error("Failed to play recitation:", e);
            }
        }
    }

    async function playAyah(ayahNum: number) {
        currentPlayingSurah = $selectedSurahIdx;
        await playAyahOfSurah($selectedSurahIdx, ayahNum);
    }

    async function playBasmallah(forSurah: number) {
        isPlayingBasmallah = true;
        currentPlayingSurah = forSurah;
        await playAyahOfSurah(1, 1, 0); // fetch surah 1:1 audio, display as ayah 0
    }

    async function playAtPlaylistIdx(idx: number) {
        const playlist = $recitationPlaylist;
        if (!playlist || !audioEl) return;
        const item = playlist[idx];
        if (!item) return;
        playlistIdx = idx;
        currentPlayingSurah = item.surah;
        await playAyahOfSurah(item.surah, item.ayah);
    }

    // Refresh downloaded surahs after a download completes
    $effect(() => {
        const p = $downloadProgress;
        if (p?.done) {
            invoke<number[]>("get_downloaded_surahs", {
                reciterId: p.reciter_id,
            }).then((surahs) => {
                downloadedSurahs.update((prev) => ({
                    ...prev,
                    [p.reciter_id]: surahs,
                }));
            });
        }
    });

    // Reset player whenever the playlist changes (new AL command or cleared)
    $effect(() => {
        void $recitationPlaylist;
        stopAndReset();
    });

    // Watch for external play requests in standard single-surah mode
    $effect(() => {
        const n = $requestPlayAyah;
        if (n === null) return;
        requestPlayAyah.set(null);
        playAyah(n);
    });

    // Watch for basmallah play requests
    $effect(() => {
        const surah = $requestPlayBasmallah;
        if (surah === null) return;
        requestPlayBasmallah.set(null);
        playBasmallah(surah);
    });

    // Watch for position-based play requests from multi-surah view
    $effect(() => {
        const pos = $requestPlayPosition;
        if (pos === null) return;
        requestPlayPosition.set(null);
        const playlist = $recitationPlaylist;
        if (!playlist) return;
        const idx = playlist.findIndex(
            (p) => p.surah === pos.surah && p.ayah === pos.ayah,
        );
        if (idx >= 0) playAtPlaylistIdx(idx);
    });

    function handleEnded() {
        if (isPlayingBasmallah) {
            isPlayingBasmallah = false;
            if (!$recitationPlaylist) {
                playAyah(1); // single-surah: auto-advance to ayah 1
            } else {
                isPlaying.set(false);
                currentPlayingAyah.set(null);
                currentPlayingSurah = null;
            }
            return;
        }
        if ($recitationPlaylist) {
            const nextIdx = playlistIdx + 1;
            if (nextIdx < $recitationPlaylist.length) {
                playAtPlaylistIdx(nextIdx);
            } else {
                isPlaying.set(false);
                currentPlayingAyah.set(null);
                currentPlayingSurah = null;
            }
        } else {
            const next = ($currentPlayingAyah ?? 0) + 1;
            if (next <= $totalAyahsInSurah) {
                playAyah(next);
            } else {
                isPlaying.set(false);
                currentPlayingAyah.set(null);
            }
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
            } else if ($recitationPlaylist) {
                playAtPlaylistIdx(0);
            } else {
                if ($selectedSurahIdx !== 1 && $selectedSurahIdx !== 9) {
                    playBasmallah($selectedSurahIdx);
                } else {
                    playAyah(1);
                }
            }
        }
    }

    function prevAyah() {
        if ($recitationPlaylist) {
            if (playlistIdx > 0) playAtPlaylistIdx(playlistIdx - 1);
        } else {
            const cur = $currentPlayingAyah ?? 1;
            if (cur > 1) playAyah(cur - 1);
        }
    }

    function nextAyah() {
        if ($recitationPlaylist) {
            if (playlistIdx < $recitationPlaylist.length - 1)
                playAtPlaylistIdx(playlistIdx + 1);
        } else {
            const cur = $currentPlayingAyah ?? 0;
            if (cur < $totalAyahsInSurah) playAyah(cur + 1);
        }
    }

    // Highlight and auto-scroll when current ayah changes
    $effect(() => {
        const ayah = $currentPlayingAyah;
        const surah = currentPlayingSurah;

        // Remove previous highlights
        document
            .querySelectorAll(".ayah-playing")
            .forEach((el) => el.classList.remove("ayah-playing"));

        if (ayah === null) return;

        // In playlist mode use surah-qualified selectors (multi-surah DOM ids)
        const inPlaylist = $recitationPlaylist !== null && surah !== null;
        const elemSelector = inPlaylist
            ? `[data-surah="${surah}"][data-ayah="${ayah}"], #ayah-${surah}-${ayah}`
            : `[data-ayah="${ayah}"], #ayah-${ayah}`;
        const anchorSelector = inPlaylist
            ? `#ayah-${surah}-${ayah}`
            : `#ayah-${ayah}`;

        document
            .querySelectorAll<HTMLElement>(elemSelector)
            .forEach((el) => el.classList.add("ayah-playing"));

        // Auto-scroll if ayah is near bottom 20% of viewport
        if (scrollContainer) {
            const anchor = scrollContainer.querySelector(anchorSelector);
            if (anchor) {
                const rect = anchor.getBoundingClientRect();
                const containerRect = scrollContainer.getBoundingClientRect();
                const threshold =
                    containerRect.bottom - containerRect.height * 0.2;
                if (rect.bottom > threshold) {
                    anchor.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                    });
                }
            }
        }
    });

    function setReciter(id: 953 | 954) {
        if (id === $activeReciterId) return;
        const ayah = $currentPlayingAyah;
        const wasPlaying = $isPlaying;
        const savedPlaylistIdx = playlistIdx;
        const inPlaylist = $recitationPlaylist !== null;
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
            if (inPlaylist) {
                playAtPlaylistIdx(savedPlaylistIdx);
            } else {
                playAyah(ayah);
            }
        }
    }
</script>

<div id="tour-recitation" class="flex flex-col items-center gap-2 z-300">
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
            <Icon
                icon="solar:wifi-router-minimalistic-bold-duotone"
                width="1rem"
                class="shrink-0"
            />
            Internet connection required to stream recitation.
        </div>
    {/if}

    <!-- Floating player pill -->
    <div
        class="flex items-center gap-1 px-2 py-1.5
               rounded-3xl
               bg-white/50 dark:bg-[#292c3c]/50
               backdrop-blur-md
               border border-stone-200/70 dark:border-[#414559]/60
               shadow-lg shadow-stone-300/30 dark:shadow-black/40
               text-sm select-none"
    >
        <!-- Prev -->
        <button
            onclick={prevAyah}
            disabled={inPlaylist
                ? playlistIdx <= 0
                : !$currentPlayingAyah || $currentPlayingAyah <= 1}
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
                icon={$isPlaying
                    ? "solar:pause-circle-bold-duotone"
                    : "solar:play-circle-bold-duotone"}
                width="1.5rem"
            />
        </button>

        <!-- Next -->
        <button
            onclick={nextAyah}
            disabled={inPlaylist
                ? playlistIdx >= playlistLen - 1
                : $currentPlayingAyah !== null &&
                  $currentPlayingAyah >= $totalAyahsInSurah}
            aria-label="Next ayah"
            class="cursor-pointer p-1.5 rounded-xl text-brand-charcoal-500 dark:text-[#838ba7]
                   hover:bg-brand-sand-100 dark:hover:bg-[#414559]/60
                   hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]
                   disabled:opacity-25 disabled:cursor-not-allowed transition-all"
        >
            <Icon icon="solar:skip-next-bold" width="1rem" />
        </button>

        <!-- Divider -->
        <div
            class="w-px h-4 bg-stone-200 dark:bg-[#414559] mx-0.5 shrink-0"
        ></div>

        <!-- Ayah counter -->
        <span
            class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] tabular-nums px-1 min-w-14 text-center"
        >
            {#if inPlaylist}
                {playlistIdx + 1} / {playlistLen}
            {:else}
                {$currentPlayingAyah ?? 1} / {$totalAyahsInSurah}
            {/if}
        </span>

        <!-- Divider -->
        <div
            class="w-px h-4 bg-stone-200 dark:bg-[#414559] mx-0.5 shrink-0"
        ></div>

        <!-- Download / spinner — only rendered when relevant; trailing divider included -->
        {#if $isDownloading || !currentSurahDownloaded}
            {#if $isDownloading}
                <div
                    class="p-1.5 text-brand-gold-500 dark:text-[#e5c890]"
                    title="Downloading…"
                >
                    <Icon
                        icon="solar:refresh-bold-duotone"
                        width="1rem"
                        class="animate-spin"
                    />
                </div>
            {:else}
                <button
                    onclick={() => recitationDownloadDialogOpen.set(true)}
                    aria-label="Download recitation"
                    class="cursor-pointer p-1.5 rounded-xl text-brand-charcoal-500 dark:text-[#838ba7]
                           hover:bg-brand-sand-100 dark:hover:bg-[#414559]/60
                           hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]
                           transition-all"
                >
                    <Icon
                        icon="solar:download-minimalistic-bold"
                        width="1rem"
                    />
                </button>
            {/if}
            <div
                class="w-px h-4 bg-stone-200 dark:bg-[#414559] mx-0.5 shrink-0"
            ></div>
        {/if}

        <!-- Reciter toggle -->
        <div class="flex items-center gap-0.5 px-0.5">
            <button
                onclick={() => setReciter(953)}
                class={`cursor-pointer px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
                    $activeReciterId === 953
                        ? "bg-brand-gold-100 dark:bg-[#3b3757] text-brand-gold-600 dark:text-[#e5c890]"
                        : "text-brand-charcoal-300 dark:text-[#626880] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
                }`}
            >
                Mishary
            </button>
            <button
                onclick={() => setReciter(954)}
                class={`cursor-pointer px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
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
<audio
    bind:this={audioEl}
    onended={handleEnded}
    onerror={handleAudioError}
    preload="none"
></audio>
