import { writable } from 'svelte/store';

export const customFontDialogOpen = writable(false);

export function openCustomFontDialog(): void {
  customFontDialogOpen.set(true);
}

export function closeCustomFontDialog(): void {
  customFontDialogOpen.set(false);
}
