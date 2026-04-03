import { writable } from "svelte/store";

export type ReciterInfo = {
    id: number;
    name: string;
    short_name: string;
    style: string; // "ayah" | "seek"
};

const storedReciter =
    typeof localStorage !== "undefined"
        ? (JSON.parse(localStorage.getItem("reciter") ?? "953") as number)
        : 953;

export const activeReciterId = writable<number>(storedReciter);
activeReciterId.subscribe((v) => {
    if (typeof localStorage !== "undefined") {
        localStorage.setItem("reciter", JSON.stringify(v));
    }
});

const storedSlots =
    typeof localStorage !== "undefined"
        ? localStorage.getItem("reciterSlots")
        : null;
export const selectedReciterSlots = writable<[number, number]>(
    storedSlots ? (JSON.parse(storedSlots) as [number, number]) : [953, 954],
);
selectedReciterSlots.subscribe((v) => {
    if (typeof localStorage !== "undefined") {
        localStorage.setItem("reciterSlots", JSON.stringify(v));
    }
});

export const availableReciters = writable<ReciterInfo[]>([]);
export const reciterSelectDialogOpen = writable(false);

export const currentPlayingAyah = writable<number | null>(null);
export const isPlaying = writable(false);
export const totalAyahsInSurah = writable(0);
// Set to an ayah number to request playback from outside the player
export const requestPlayAyah = writable<number | null>(null);
// Set to a surah number to request basmallah playback (audio = surah 1:1, displayed as ayah 0)
export const requestPlayBasmallah = writable<number | null>(null);

// Ordered playlist for multi-surah / filtered AL playback. null = standard single-surah mode.
export const recitationPlaylist = writable<{ surah: number; ayah: number }[] | null>(null);
// Set to request playback of a specific surah+ayah position (used by multi-surah play buttons)
export const requestPlayPosition = writable<{ surah: number; ayah: number } | null>(null);

// ── Offline download ──────────────────────────────────────────────────────────
export const downloadedSurahs = writable<Record<number, number[]>>({});
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

// Controls visibility of the RecitationDownloadDialog (rendered outside parchment stacking context)
export const recitationDownloadDialogOpen = writable(false);
