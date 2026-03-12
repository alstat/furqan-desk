import { writable } from "svelte/store";

const storedReciter =
    typeof localStorage !== "undefined"
        ? (JSON.parse(localStorage.getItem("reciter") ?? "953") as 953 | 954)
        : 953;

export const activeReciterId = writable<953 | 954>(storedReciter);
activeReciterId.subscribe((v) => {
    if (typeof localStorage !== "undefined") {
        localStorage.setItem("reciter", JSON.stringify(v));
    }
});

export const currentPlayingAyah = writable<number | null>(null);
export const isPlaying = writable(false);
export const totalAyahsInSurah = writable(0);
// Set to an ayah number to request playback from outside the player
export const requestPlayAyah = writable<number | null>(null);

// Ordered playlist for multi-surah / filtered AL playback. null = standard single-surah mode.
export const recitationPlaylist = writable<{ surah: number; ayah: number }[] | null>(null);
// Set to request playback of a specific surah+ayah position (used by multi-surah play buttons)
export const requestPlayPosition = writable<{ surah: number; ayah: number } | null>(null);

// ── Offline download ──────────────────────────────────────────────────────────
export const downloadedSurahs = writable<Record<number, number[]>>({ 953: [], 954: [] });
export const isDownloading = writable(false);

export type DownloadProgress = {
    reciter_id: number;
    surah: number;
    ayah: number;
    downloaded: number;
    total: number;
    done: boolean;
    failed: boolean;
} | null;

export const downloadProgress = writable<DownloadProgress>(null);
