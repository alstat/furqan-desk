import { writable } from 'svelte/store';

/** Visibility of the postcard editor window (opened from the Surah widget). */
export const postcardDialogOpen = writable(false);
