import { writable } from 'svelte/store';

// Measured height of the window header bar. The page lays itself out from
// window.innerHeight rather than from a flex parent, so it needs the number
// the header actually took — which moves with the UI font scale.
export const headerHeight = writable(0);

// The Quran buttons live in the window header now, but their behaviour still
// belongs to Parchment (it owns the dialogs, the search request and the
// morphology stores it writes into). Parchment publishes its handlers here on
// mount and the header calls back into them.
export interface ParchmentHeaderActions {
	onOpenBookmarks: () => void;
	onOpenHighlights: () => void;
	onSearch: (query: string) => void;
}

export const parchmentActions = writable<ParchmentHeaderActions | null>(null);
export const parchmentSearching = writable(false);
