/**
 * Opening the settings dialog from elsewhere in the app.
 *
 * The dialog used to be owned entirely by `+page.svelte`, which is fine while
 * the only thing that opens it is a button in the toolbar next to it. The R and
 * Python REPL panes need it too — when an interpreter is missing they offer to
 * take the user straight to the setting that points at one — and they are
 * nowhere near that state, so the flag lives here instead.
 */

import { get, writable } from 'svelte/store';

export const settingsOpen = writable(false);

/**
 * A section the dialog should scroll to once it is open, matched against a
 * `data-settings-section` attribute. Cleared by the dialog after it jumps, so
 * reopening later lands at the top as usual.
 */
export const settingsScrollTarget = writable<string | null>(null);

/** Open the dialog at a particular section. */
export function openSettingsTo(section: string): void {
	settingsScrollTarget.set(section);
	if (!get(settingsOpen)) settingsOpen.set(true);
}

export function closeSettings(): void {
	settingsOpen.set(false);
	settingsScrollTarget.set(null);
}
