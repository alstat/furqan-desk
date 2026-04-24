import { writable } from 'svelte/store';

export const manuscriptsEnabled = writable<boolean>(true);

export const manuscriptViewerOpen = writable(false);
export const manuscriptDemoOpen = writable(false);
export const manuscriptAyah = writable<{ surah: number; ayah: number } | null>(null);
