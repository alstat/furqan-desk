import { writable } from 'svelte/store';

// Measured height of the window header bar. The page lays itself out from
// window.innerHeight rather than from a flex parent, so it needs the number
// the header actually took — which moves with the UI font scale.
export const headerHeight = writable(0);

/**
 * Where the header's bottom edge actually falls in the viewport, border and
 * all, straight from `getBoundingClientRect()`.
 *
 * The panels that hang off the header (Insert Image/Equation/Table/Code,
 * Bookmarks, Highlights) are `position: fixed`, so they need that number in
 * viewport coordinates. Reconstructing it as `headerHeight + 1` does not
 * survive contact with reality: `clientHeight` excludes the border and is
 * rounded to an integer, so the arithmetic lands a pixel off on one platform
 * or the other depending on the device pixel ratio — which is exactly how the
 * header's bottom border ended up showing through as a seam. The rect is
 * unrounded and already includes the Linux CSD shadow margin, so it needs no
 * per-platform correction either.
 */
export const headerBottom = writable(0);

// The Quran buttons live in the window header now, but their behaviour still
// belongs to Parchment (it owns the dialogs, the search request and the
// morphology stores it writes into). Parchment publishes its handlers here on
// mount and the header calls back into them.
export interface ParchmentHeaderActions {
	/** `anchor` is the triggering button's rect, so the panel can drop out of it. */
	onOpenBookmarks: (anchor?: DOMRect) => void;
	onOpenHighlights: (anchor?: DOMRect) => void;
	onSearch: (query: string) => void;
}

export const parchmentActions = writable<ParchmentHeaderActions | null>(null);
export const parchmentSearching = writable(false);
