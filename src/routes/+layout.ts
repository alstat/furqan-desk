import { get } from 'svelte/store';
import { ensureLocale, locale } from '$lib/i18n';

export const ssr = false;

/**
 * Locale dictionaries are code-split, so the active one has to be in hand
 * before anything renders — otherwise a non-English window paints English and
 * then swaps. Runs for every window, secondary ones included; the chunk is
 * local and already cached after the first window opens.
 */
export const load = async (): Promise<void> => {
    await ensureLocale(get(locale));
};
