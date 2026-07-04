import { writable } from "svelte/store";

// Bumped whenever the repository's git state may have changed out-of-band — for
// example after the user commits/pushes from the integrated terminal, or when
// the window regains focus after they used an external terminal. Views that
// show git information (the CodeMirror diff gutter, the File Explorer change
// colouring) subscribe to this and re-read status/diff, so the highlighting
// stays in sync without the file needing to be reopened.
export const gitRefreshTrigger = writable(0);

let _timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Signal a possible git-state change. Debounced so a burst of terminal output
 * (a command streaming many lines) collapses into a single refresh once it
 * settles. Pass `delay = 0` for an immediate bump (e.g. on window focus).
 */
export function bumpGitRefresh(delay = 400): void {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => {
        _timer = null;
        gitRefreshTrigger.update((n) => n + 1);
    }, delay);
}
