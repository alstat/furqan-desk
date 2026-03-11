import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TermLine = { text: string; is_stderr: boolean; is_input: boolean };
export type TermTab  = { id: string; label: string };

export interface JuliaTabTermState {
    activePanel:     string;
    termTabs:        TermTab[];
    termOutputLines: Record<string, TermLine[]>;
    termIsRunning:   Record<string, boolean>;
    termExited:      Record<string, boolean>;
    termCounter:     number;
    termInputValues: Record<string, string>;
}

export function makeDefaultTermState(): JuliaTabTermState {
    return {
        activePanel:     'julia',
        termTabs:        [],
        termOutputLines: {},
        termIsRunning:   {},
        termExited:      {},
        termCounter:     0,
        termInputValues: {},
    };
}

// ── Stores ────────────────────────────────────────────────────────────────────

/** Per Julia tab-ID → terminal/REPL panel state (persisted across mounts) */
export const juliaTermStates   = writable<Record<string, JuliaTabTermState>>({});

/** The secondary Julia tab shown in split view (null = no split) */
export const splitJuliaTabId   = writable<string | null>(null);

/** Which Julia tab is currently running code in the REPL */
export const runningJuliaTabId = writable<string | null>(null);

/** Whether the Julia REPL is currently busy executing code */
export const juliaIsRunning    = writable<boolean>(false);

// ── Shared execute helper (used by both JuliaEditor keymap and JuliaReplPane) ─

export async function executeJuliaCode(
    tabId:   string,
    snippet: string,
    onStart?: () => void,
): Promise<void> {
    // Lazy import to avoid circular deps at module load time
    const { juliaReplHistory, juliaReplStarted } = await import('./editor.store');

    snippet = snippet.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!snippet.trim()) return;

    juliaIsRunning.set(true);
    runningJuliaTabId.set(tabId);
    onStart?.();

    juliaReplHistory.update(h => ({
        ...h,
        [tabId]: [...(h[tabId] ?? []), { text: snippet, kind: 'input' as const }],
    }));

    if (!get(juliaReplStarted)) {
        await invoke('start_julia_repl');
        juliaReplStarted.set(true);
    }
    await invoke('run_julia_code', { code: snippet });
}
