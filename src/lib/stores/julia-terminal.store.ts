import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TermTab = { id: string; label: string };

export interface SharedTermState {
    activePanel: string;
    termTabs:    TermTab[];
    termExited:  Record<string, boolean>;
    termCounter: number;
}

// ── Stores ────────────────────────────────────────────────────────────────────

/** Shared terminal/REPL panel state for all Julia tabs. Terminal output and
 *  input are owned by xterm.js instances, so no buffered output/input state
 *  is kept here — only the tab list and which panel is currently visible. */
export const sharedTermState = writable<SharedTermState>({
    activePanel: 'julia',
    termTabs:    [],
    termExited:  {},
    termCounter: 0,
});

/** A paired group of two Julia editors sharing split view */
export type JuliaGroup = {
    id: string;       // unique group id
    tabA: string;     // first tab id
    tabB: string;     // second tab id
    colorIdx: number; // index into GROUP_COLORS palette
};

export const juliaGroups = writable<JuliaGroup[]>([]);

export function createJuliaGroup(tabA: string, tabB: string): void {
    juliaGroups.update(gs => {
        const usedColors = new Set(gs.map(g => g.colorIdx));
        let colorIdx = 0;
        while (usedColors.has(colorIdx)) colorIdx++;
        return [...gs, { id: crypto.randomUUID(), tabA, tabB, colorIdx }];
    });
}

export function removeJuliaGroup(groupId: string): void {
    juliaGroups.update(gs => gs.filter(g => g.id !== groupId));
}

export function removeJuliaGroupByTab(tabId: string): void {
    juliaGroups.update(gs => gs.filter(g => g.tabA !== tabId && g.tabB !== tabId));
}

/**
 * A paired group where any editor type (Julia/Typst/Lexical) can be the host.
 * hostTabId stays in the sidebar; partnerTabId goes to the left panel.
 */
export type CrossGroup = {
    id: string;
    hostTabId: string;
    partnerTabId: string;
    colorIdx: number;
};

export const crossGroups = writable<CrossGroup[]>([]);

export function createCrossGroup(
    hostTabId: string,
    partnerTabId: string,
): void {
    crossGroups.update(gs => {
        const usedColors = new Set(gs.map(g => g.colorIdx));
        let colorIdx = 0;
        while (usedColors.has(colorIdx)) colorIdx++;
        return [...gs, { id: crypto.randomUUID(), hostTabId, partnerTabId, colorIdx }];
    });
}

export function removeCrossGroup(groupId: string): void {
    crossGroups.update(gs => gs.filter(g => g.id !== groupId));
}

export function removeCrossGroupByTab(tabId: string): void {
    crossGroups.update(gs =>
        gs.filter(g => g.hostTabId !== tabId && g.partnerTabId !== tabId)
    );
}

/** Whether the Julia REPL is currently busy executing code */
export const juliaIsRunning  = writable<boolean>(false);

/** Tab id that is currently flashing (after a grouped-tab click) */
export const flashingTabId = writable<string | null>(null);

// ── Shared execute helper (used by both JuliaEditor keymap and JuliaReplPane) ─

export async function executeJuliaCode(
    snippet: string,
    onStart?: () => void,
): Promise<void> {
    // Lazy import to avoid circular deps at module load time
    const { juliaReplHistory, juliaReplStarted } = await import('./editor.store');

    snippet = snippet.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!snippet.trim()) return;

    juliaIsRunning.set(true);
    onStart?.();

    juliaReplHistory.update(h => [...h, { text: snippet, kind: 'input' as const }]);

    if (!get(juliaReplStarted)) {
        const { openFolderPath } = await import('./tabs.store');
        await invoke('start_julia_repl', { cwd: get(openFolderPath) });
        juliaReplStarted.set(true);
    }
    await invoke('run_julia_code', { code: snippet });
}
