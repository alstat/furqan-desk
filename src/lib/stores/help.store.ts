import { writable } from 'svelte/store';

interface HelpState {
    open: boolean;
    section: string | null;
}

export const helpStore = writable<HelpState>({ open: false, section: null });

export function openHelp(section?: string): void {
    helpStore.set({ open: true, section: section ?? null });
}

export function closeHelp(): void {
    helpStore.update(s => ({ ...s, open: false }));
}
