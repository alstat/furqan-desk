<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import Icon from "@iconify/svelte";
    import { onMount, onDestroy, tick } from "svelte";
    import { fly } from "svelte/transition";
    import { selectedSurahIdx, hideSurahPage } from "$lib/stores/quran.svelte";
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
        requestPlayDirect,
        requestPlayBlock,
        requestPlayBasmallah,
        recitationDownloadDialogOpen,
        selectedReciterSlots,
        availableReciters,
        reciterSelectDialogOpen,
        type ReciterInfo,
    } from "$lib/stores/recitation.store";

    import { t } from "$lib/i18n";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import { csdMarginPx } from "$lib/stores/window-state.store";

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
    // True while the current playback was triggered via requestPlayDirect (e.g. QuranBlock).
    // Highlighting then targets surah-qualified data attributes instead of plain ayah ids.
    let directPlayActive = $state(false);
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
        directPlayActive = false;
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
                // Arrives as a raw ArrayBuffer — Blob takes it directly, with
                // no per-byte JSON array to parse and no intermediate copy.
                const bytes = await invoke<ArrayBuffer>("read_audio_bytes", {
                    path: result.audio_url,
                });
                if (gen !== playGeneration) return;
                const blob = new Blob([bytes], { type: "audio/mpeg" });
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
        directPlayActive = false;
        currentPlayingSurah = $selectedSurahIdx;
        await playAyahOfSurah($selectedSurahIdx, ayahNum);
    }

    async function playBasmallah(forSurah: number) {
        directPlayActive = false;
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
        directPlayActive = false;
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

    // Watch for direct play requests (e.g. editor QuranBlock) — plays
    // regardless of whether the requested ayah is in the current playlist.
    $effect(() => {
        const pos = $requestPlayDirect;
        if (pos === null) return;
        requestPlayDirect.set(null);
        directPlayActive = true;
        currentPlayingSurah = pos.surah;
        void playAyahOfSurah(pos.surah, pos.ayah);
    });

    // Watch for block-scoped playlist requests (e.g. a single QuranBlock).
    // Installs the block's verses as the active playlist so auto-advance stays
    // within the block and stops at the block's last verse.
    $effect(() => {
        const req = $requestPlayBlock;
        if (req === null) return;
        requestPlayBlock.set(null);
        if (req.playlist.length === 0) return;
        const startIdx = Math.max(
            0,
            Math.min(req.startIdx, req.playlist.length - 1),
        );
        recitationPlaylist.set(req.playlist);
        // The playlist subscriber runs stopAndReset(); wait for it to settle
        // before starting playback so our play call isn't immediately cancelled.
        const item = req.playlist[startIdx];
        void (async () => {
            await tick();
            directPlayActive = false;
            playlistIdx = startIdx;
            currentPlayingSurah = item.surah;
            await playAyahOfSurah(item.surah, item.ayah);
        })();
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

        // Direct-play (e.g. QuranBlock) — match only surah-qualified elements
        // so we don't accidentally highlight parchment ayahs from a different surah.
        const inPlaylist = $recitationPlaylist !== null && surah !== null;
        const elemSelector = directPlayActive && surah !== null
            ? `[data-surah="${surah}"][data-ayah="${ayah}"]`
            : inPlaylist
                ? `[data-surah="${surah}"][data-ayah="${ayah}"], #ayah-${surah}-${ayah}`
                : `[data-ayah="${ayah}"], #ayah-${ayah}`;
        const anchorSelector = directPlayActive && surah !== null
            ? `[data-surah="${surah}"][data-ayah="${ayah}"]`
            : inPlaylist
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

    // ── Floating mini player (visible while the surah page is hidden) ───────
    // The parchment root gets display:none when the surah page is hidden, which
    // hides the main pill but keeps this component (and its <audio>) alive. The
    // mini player is portaled to <body> so it escapes the hidden subtree.
    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

    const MINI_W = 230;
    const MINI_H = 48;
    let miniEl = $state<HTMLDivElement | null>(null);
    let miniX = $state(0);
    let miniY = $state(0);
    let miniInitialized = false;
    // Once the user drags the pill we stop re-anchoring it to the bottom-right
    // corner on resize and only clamp it back into the viewport.
    let miniUserMoved = false;
    // Dismissed via the close button; audio keeps playing. Resets when the
    // surah page is shown again so the next hide brings the pill back.
    let miniDismissed = $state(false);

    $effect(() => {
        if (!$hideSurahPage()) miniDismissed = false;
    });
    let miniDragging = $state(false);
    // Resting below the floating widgets (z-[60]). Bumped via the window
    // manager while dragging so the pill rides above other draggable panels
    // (e.g. JuliaPlotViewer) but stays under fixed modals (z-9999).
    let miniZ = $state(50);
    let miniDragStartX = 0,
        miniDragStartY = 0,
        miniStartX = 0,
        miniStartY = 0;

    function miniDefaultPosition() {
        const miniWidth = miniEl?.offsetWidth ?? MINI_W;
        const miniHeight = miniEl?.offsetHeight ?? MINI_H;
        miniX = Math.max(
            $csdMarginPx + 8,
            window.innerWidth - $csdMarginPx - miniWidth - 24,
        );
        miniY = Math.max(
            $csdMarginPx + 8,
            window.innerHeight - $csdMarginPx - miniHeight - 48,
        );
    }

    $effect(() => {
        if ($hideSurahPage() && !miniInitialized) {
            miniDefaultPosition();
            miniInitialized = true;
        }
    });

    function handleWindowResize() {
        if (!miniInitialized) return;
        if (miniUserMoved) {
            const miniWidth = miniEl?.offsetWidth ?? MINI_W;
            const miniHeight = miniEl?.offsetHeight ?? MINI_H;
            miniX = Math.max(
                $csdMarginPx,
                Math.min(
                    window.innerWidth - $csdMarginPx - miniWidth,
                    miniX,
                ),
            );
            miniY = Math.max(
                $csdMarginPx,
                Math.min(
                    window.innerHeight - $csdMarginPx - miniHeight,
                    miniY,
                ),
            );
        } else {
            miniDefaultPosition();
        }
    }

    function miniStartDrag(e: PointerEvent) {
        miniDragging = true;
        miniUserMoved = true;
        miniZ = bringToFront();
        miniDragStartX = e.clientX;
        miniDragStartY = e.clientY;
        miniStartX = miniX;
        miniStartY = miniY;
        window.addEventListener("pointermove", miniOnDrag);
        window.addEventListener("pointerup", miniStopDrag, { once: true });
    }

    function miniOnDrag(e: PointerEvent) {
        const miniWidth = miniEl?.offsetWidth ?? MINI_W;
        const miniHeight = miniEl?.offsetHeight ?? MINI_H;
        miniX = Math.max(
            $csdMarginPx,
            Math.min(
                window.innerWidth - $csdMarginPx - miniWidth,
                miniStartX + (e.clientX - miniDragStartX),
            ),
        );
        miniY = Math.max(
            $csdMarginPx,
            Math.min(
                window.innerHeight - $csdMarginPx - miniHeight,
                miniStartY + (e.clientY - miniDragStartY),
            ),
        );
    }

    function miniStopDrag() {
        miniDragging = false;
        window.removeEventListener("pointermove", miniOnDrag);
    }

    onDestroy(() => {
        if (typeof window !== "undefined")
            window.removeEventListener("pointermove", miniOnDrag);
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

<svelte:window onresize={handleWindowResize} />

<div id="tour-recitation" class="flex flex-col items-center gap-2 z-300">
    <!-- No internet toast -->
    {#if noInternetToast && !allSurahsDownloaded}
        <div
            class="flex items-center gap-2 px-3 py-2
                   rounded-2xl
                   glass-panel
                   bg-white/90 dark:bg-[#292c3c]/95
                   backdrop-blur-md
                   border border-red-200/80 dark:border-red-900/50
                   shadow-md shadow-stone-300/20 dark:shadow-black/20
                   text-xs text-red-500 dark:text-red-400
                   select-none"
        >
            <Icon
                icon="solar:wi-fi-router-minimalistic-bold-duotone"
                width="1rem"
                class="shrink-0"
            />
            {$t("recitation.no_internet")}
        </div>
    {/if}

    <!-- Floating player pill -->
    <div
        class="flex items-center gap-1 px-2 py-1.5
               rounded-xl
               glass-panel
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

        <!-- Download / progress — always visible during download; trailing divider -->
        {#if $isDownloading}
            {@const progressPct = $downloadProgress && $downloadProgress.total > 0 ? ($downloadProgress.downloaded / $downloadProgress.total) * 100 : 0}
            <button
                onclick={async () => {
                    try {
                        await invoke("cancel_recitation_download");
                        isDownloading.set(false);
                        downloadProgress.set(null);
                    } catch (e) {
                        console.error("Cancel failed:", e);
                    }
                }}
                title={$t("recitation.cancel")}
                aria-label={$t("recitation.cancel")}
                class="cursor-pointer flex items-center gap-1.5 px-1 hover:bg-brand-sand-100 dark:hover:bg-[#414559]/60 rounded-lg transition-colors"
            >
                <Icon
                    icon="solar:refresh-bold-duotone"
                    width="0.875rem"
                    class="animate-spin text-brand-gold-500 dark:text-[#e5c890]"
                />
                <div class="w-10 h-1 rounded-full bg-stone-200 dark:bg-[#414559] overflow-hidden">
                    <div
                        class="h-full rounded-full bg-brand-gold-500 dark:bg-[#e5c890] transition-all duration-300"
                        style={`width: ${progressPct}%`}
                    ></div>
                </div>
                <span class="text-[10px] font-medium text-brand-gold-600 dark:text-[#e5c890]">
                    {Math.round(progressPct)}%
                </span>
            </button>
            <div
                class="w-px h-4 bg-stone-200 dark:bg-[#414559] mx-0.5 shrink-0"
            ></div>
        {:else if !currentSurahDownloaded}
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

<!-- Floating mini player — shown while the surah page is hidden -->
{#if $hideSurahPage() && !miniDismissed}
    <div
        bind:this={miniEl}
        use:portal
        transition:fly={{ y: 8, duration: 180, opacity: 0 }}
        class="fixed flex items-center gap-1 px-2 py-1.5 font-sans
               rounded-xl
               glass-panel
               bg-white/80 dark:bg-[#292c3c]/90
               backdrop-blur-md
               border border-stone-200/70 dark:border-[#414559]/60
               shadow-lg shadow-stone-300/30 dark:shadow-black/30
               text-sm select-none"
        style="left:{miniX}px; top:{miniY}px; z-index: {miniZ};"
    >
        <!-- Drag handle -->
        <div
            onpointerdown={miniStartDrag}
            role="presentation"
            class="{miniDragging
                ? 'cursor-grabbing'
                : 'cursor-grab'} p-1 text-brand-gold-500 dark:text-[#e5c890]"
        >
            <Icon icon="solar:book-bold-duotone" width="1rem" />
        </div>

        <!-- Prev -->
        <button
            onclick={prevAyah}
            disabled={inPlaylist
                ? playlistIdx <= 0
                : !$currentPlayingAyah || $currentPlayingAyah <= 1}
            aria-label={$t("recitation.prev")}
            class="cursor-pointer p-1 rounded-xl text-brand-charcoal-500 dark:text-[#838ba7]
                   hover:bg-brand-sand-100 dark:hover:bg-[#414559]/60
                   hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]
                   disabled:opacity-25 disabled:cursor-not-allowed transition-all"
        >
            <Icon icon="solar:skip-previous-bold" width="0.9rem" />
        </button>

        <!-- Play/Pause -->
        <button
            onclick={togglePlay}
            aria-label={$isPlaying
                ? $t("recitation.pause")
                : $t("recitation.play")}
            class="cursor-pointer p-1 rounded-xl
                   text-brand-gold-600 dark:text-[#e5c890]
                   hover:bg-brand-gold-50 dark:hover:bg-[#3b3757]
                   transition-all"
        >
            <Icon
                icon={$isPlaying
                    ? "solar:pause-circle-bold-duotone"
                    : "solar:play-circle-bold-duotone"}
                width="1.35rem"
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
            class="cursor-pointer p-1 rounded-xl text-brand-charcoal-500 dark:text-[#838ba7]
                   hover:bg-brand-sand-100 dark:hover:bg-[#414559]/60
                   hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]
                   disabled:opacity-25 disabled:cursor-not-allowed transition-all"
        >
            <Icon icon="solar:skip-next-bold" width="0.9rem" />
        </button>

        <!-- Divider -->
        <div
            class="w-px h-4 bg-stone-200 dark:bg-[#414559] mx-0.5 shrink-0"
        ></div>

        <!-- Ayah counter -->
        <span
            class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7] tabular-nums px-1 min-w-12 text-center"
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

        <!-- Close -->
        <button
            onclick={() => (miniDismissed = true)}
            aria-label={$t("common.close")}
            class="cursor-pointer p-1 rounded-xl text-brand-charcoal-300 dark:text-[#626880]
                   hover:bg-brand-sand-100 dark:hover:bg-[#414559]/60
                   hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]
                   transition-all"
        >
            <Icon icon="solar:close-circle-bold-duotone" width="0.9rem" />
        </button>
    </div>
{/if}
