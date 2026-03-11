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
