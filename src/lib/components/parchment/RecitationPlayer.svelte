<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import Icon from "@iconify/svelte";
    import { selectedSurahIdx } from "$lib/stores/quran.svelte";
    import {
        activeReciterId,
        currentPlayingAyah,
        isPlaying,
        totalAyahsInSurah,
        requestPlayAyah,
    } from "$lib/stores/recitation.store";

    let { scrollContainer }: { scrollContainer: HTMLElement | null } = $props();

    let audioEl = $state<HTMLAudioElement | null>(null);

    // Reset player when surah changes
    $effect(() => {
        $selectedSurahIdx; // track
        stopAndReset();
    });

    function stopAndReset() {
        if (audioEl) {
            audioEl.pause();
            audioEl.src = "";
        }
        currentPlayingAyah.set(null);
        isPlaying.set(false);
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
            } | null>("get_recitation_ayah", {
                surah,
                ayah: ayahNum,
                reciterId,
            });

            if (!result) return;

            audioEl.src = result.audio_url;
            audioEl.load();
            currentPlayingAyah.set(ayahNum);
            isPlaying.set(true);
            await audioEl.play();
        } catch (e: unknown) {
            // Ignore AbortError — happens when a new play() interrupts a pending one
            if (e instanceof DOMException && e.name === "AbortError") return;
            console.error("Failed to play recitation:", e);
            isPlaying.set(false);
        }
    }

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
            audioEl.src = "";
        }
        isPlaying.set(false);
        activeReciterId.set(id);
        if (ayah !== null && wasPlaying) {
            playAyah(ayah);
        }
    }
</script>

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

<!-- Hidden audio element -->
<audio bind:this={audioEl} onended={handleEnded} preload="none"></audio>
