import { writable, type Writable } from 'svelte/store';
import type { Bookmark, LastRead, Highlight } from '$lib/types/bookmarks';

export const bookmarks: Writable<Bookmark[]>         = writable([]);
export const lastRead:  Writable<LastRead | null>    = writable(null);
export const highlights: Writable<Highlight[]>       = writable([]);

/** Ayah the user last clicked — used as default in the bookmark form. */
export const currentReadingAyah: Writable<{ surah: number; ayah: number } | null> = writable(null);

/** Set before a surah-navigation so Parchment can scroll to the target ayah. */
export const pendingJumpAyah: Writable<number | null> = writable(null);
