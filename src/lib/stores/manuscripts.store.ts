import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const manuscriptsEnabled = writable<boolean>(
    browser ? (localStorage.getItem('manuscriptsEnabled') ?? 'true') !== 'false' : true
);
manuscriptsEnabled.subscribe(v => {
    if (browser) localStorage.setItem('manuscriptsEnabled', String(v));
});

export const manuscriptViewerOpen = writable(false);
export const manuscriptDemoOpen = writable(false);
export const manuscriptAyah = writable<{ surah: number; ayah: number } | null>(null);
