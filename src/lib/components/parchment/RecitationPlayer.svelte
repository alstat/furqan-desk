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
        selectedReciterSlots,
        availableReciters,
        reciterSelectDialogOpen,
        type ReciterInfo,
    } from "$lib/stores/recitation.store";

    import { t } from "$lib/i18n";

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
    // Seek-mode state for surah-level audio reciters (e.g. Maher)
    let seekEndMs = $state<number | null>(null);
    // Monotonically-increasing counter; each playAyahOfSurah call captures its own
    // value so that stale async continuations can detect they've been superseded.
    let playGeneration = 0;

    const inPlaylist = $derived($recitationPlaylist !== null);
    const playlistLen = $derived($recitationPlaylist?.length ?? 0);

    function revokeBlobUrl() {
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }
    }

    const activeReciterInfo = $derived(
        $availableReciters.find((r: ReciterInfo) => r.id === $activeReciterId),
    );

    let currentSurahDownloaded = $derived(
        $downloadedSurahs[$activeReciterId]?.includes($selectedSurahIdx) ??
            false,
    );

    const allSurahsDownloaded = $derived(
        ($downloadedSurahs[$activeReciterId]?.length ?? 0) >= 114,
    );

    // Populate downloaded-surahs store and reciter list on startup
    onMount(async () => {
        try {
            const reciters = await invoke<ReciterInfo[]>("get_reciters");
            availableReciters.set(reciters);

            // Fetch downloaded surahs for all reciters (ayah-style and seek-style)
            const results = await Promise.all(
                reciters.map((r) =>
                    invoke<number[]>("get_downloaded_surahs", {
                        reciterId: r.id,
                    }),
                ),
            );
            const counts: Record<number, number[]> = {};
            reciters.forEach((r, i) => {
                counts[r.id] = results[i];
            });
            downloadedSurahs.set(counts);
        } catch (e) {
            console.error("Failed to initialise reciter data:", e);
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

    function handleTimeUpdate() {
        if (
            seekEndMs !== null &&
            audioEl &&
            audioEl.currentTime * 1000 >= seekEndMs
        ) {
            seekEndMs = null;
            audioEl.pause(); // prevent the surah MP3 from running to its end and re-triggering onended
            handleEnded();
        }
    }

    // Reset player when surah changes
    $effect(() => {
        $selectedSurahIdx; // track
        stopAndReset();
    });

    function stopAndReset() {
        playGeneration++; // cancel any in-flight playAyahOfSurah
        revokeBlobUrl();
        if (audioEl) {
            audioEl.pause();
            audioEl.src = "";
            audioEl.load(); // exits the error/aborted state so the element is ready for next play
        }
        currentPlayingAyah.set(null);
        isPlaying.set(false);
        isCurrentLocal = false;
        seekEndMs = null;
        playlistIdx = 0;
        currentPlayingSurah = null;
    }

    async function playAyahOfSurah(
        surah: number,
        ayahNum: number,
        displayAyah?: number,
    ) {
        if (!audioEl) return;
        // Synchronously stop old audio so handleTimeUpdate can't fire handleEnded and outrun this request
        seekEndMs = null;
        audioEl.pause();
        const reciterId = $activeReciterId;
        const gen = ++playGeneration;
        try {
            const result = await invoke<{
                audio_url: string;
                duration: number | null;
                segments: string | null;
                is_local: boolean;
                seek_start: number | null;
                seek_end: number | null;
            } | null>("get_recitation_ayah", {
                surah,
                ayah: ayahNum,
                reciterId,
            });

            if (gen !== playGeneration) return; // superseded by a newer play request
            if (!result) return;

            isCurrentLocal = result.is_local;
            revokeBlobUrl();

            // Set the audio source (blob for local files, URL for remote)
            if (result.is_local) {
                const bytes = await invoke<number[]>("read_audio_bytes", {
                    path: result.audio_url,
                });
                if (gen !== playGeneration) return;
                const blob = new Blob([new Uint8Array(bytes)], {
                    type: "audio/mpeg",
                });
                currentBlobUrl = URL.createObjectURL(blob);
                audioEl.src = currentBlobUrl;
            } else {
                audioEl.src = result.audio_url;
            }

            // For seek-style reciters, load + seek to ayah start (local or remote)
            if (result.seek_start !== null) {
                audioEl.load();
                await new Promise<void>((resolve) => {
                    audioEl!.addEventListener(
                        "loadedmetadata",
                        () => resolve(),
                        { once: true },
                    );
                });
                if (gen !== playGeneration) return;
                audioEl.currentTime = result.seek_start / 1000;
                seekEndMs = result.seek_end;
            } else {
                seekEndMs = null;
                audioEl.load();
            }

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
        seekEndMs = null;
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

    function setReciter(id: number) {
        if (id === $activeReciterId) return;
        const ayah = $currentPlayingAyah;
        const wasPlaying = $isPlaying;
        const savedPlaylistIdx = playlistIdx;
        const inPlaylist = $recitationPlaylist !== null;
        playGeneration++; // cancel any in-flight playAyahOfSurah before we start a new one
        if (audioEl) {
            audioEl.pause();
            // Do NOT clear audioEl.src here — setting it to "" puts Chromium into
            // an aborted state that survives a subsequent load(), causing play() to
            // throw NotSupportedError. playAyah() overwrites the src itself.
        }
        revokeBlobUrl();
        isCurrentLocal = false;
        seekEndMs = null;
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
    {#if noInternetToast && !allSurahsDownloaded}
        <div
            class="flex items-center gap-2 px-3 py-2
                   rounded-2xl
                   bg-white/90 dark:bg-[#292c3c]/95
                   backdrop-blur-md
                   border border-red-200/80 dark:border-red-900/50
                   shadow-md shadow-stone-300/20 dark:shadow-black/20
                   text-xs text-red-500 dark:text-red-400
                   select-none"
        >
            <Icon
                icon="solar:wifi-router-minimalistic-bold-duotone"
                width="1rem"
                class="shrink-0"
            />
            {$t("recitation.no_internet")}
        </div>
    {/if}

    <!-- Floating player pill -->
    <div
        class="flex items-center gap-1 px-2 py-1.5
               rounded-3xl
               bg-white/50 dark:bg-[#292c3c]/50
               backdrop-blur-md
               border border-stone-200/70 dark:border-[#414559]/60
               shadow-md shadow-stone-300/20 dark:shadow-black/20
               text-sm select-none"
    >
        <!-- Prev -->
        <button
            onclick={prevAyah}
            disabled={inPlaylist
                ? playlistIdx <= 0
                : !$currentPlayingAyah || $currentPlayingAyah <= 1}
            aria-label={$t("recitation.prev")}
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
            aria-label={$isPlaying
                ? $t("recitation.pause")
                : $t("recitation.play")}
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
            aria-label={$t("recitation.next")}
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
                {$t("recitation.counter", {
                    current: String(playlistIdx + 1),
                    total: String(playlistLen),
                })}
            {:else}
                {$t("recitation.counter", {
                    current: String($currentPlayingAyah ?? 1),
                    total: String($totalAyahsInSurah),
                })}
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
                    title={$t("recitation.downloading")}
                    aria-label={$t("recitation.downloading")}
                    role="status"
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
                    aria-label={$t("recitation.download")}
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
            {#each $selectedReciterSlots as slotId (slotId)}
                {@const info = $availableReciters.find(
                    (r: ReciterInfo) => r.id === slotId,
                )}
                <button
                    onclick={() => setReciter(slotId)}
                    aria-pressed={$activeReciterId === slotId}
                    class={`cursor-pointer px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
                        $activeReciterId === slotId
                            ? "bg-brand-gold-100 dark:bg-[#3b3757] text-brand-gold-600 dark:text-[#e5c890]"
                            : "text-brand-charcoal-300 dark:text-[#626880] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
                    }`}
                >
                    {info?.short_name ?? String(slotId)}
                </button>
            {/each}
        </div>

        <!-- Divider -->
        <div
            class="w-px h-4 bg-stone-200 dark:bg-[#414559] mx-0.5 shrink-0"
        ></div>

        <!-- Manage reciters button -->
        <button
            onclick={() => reciterSelectDialogOpen.set(true)}
            aria-label={$t("reciter_select.manage")}
            class="cursor-pointer p-1.5 rounded-xl text-brand-charcoal-500 dark:text-[#838ba7]
                   hover:bg-brand-sand-100 dark:hover:bg-[#414559]/60
                   hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]
                   transition-all"
        >
            <Icon icon="solar:settings-minimalistic-bold" width="0.9rem" />
        </button>
    </div>
</div>

<!-- Hidden audio element -->
<audio
    bind:this={audioEl}
    onended={handleEnded}
    onerror={handleAudioError}
    ontimeupdate={handleTimeUpdate}
    preload="none"
></audio>
