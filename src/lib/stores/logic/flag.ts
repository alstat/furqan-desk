// The Lean Logic Pipeline's feature flag.
//
// The dialect ships disabled: it is a large, unfinished surface (the roadmap's
// phases 2-4 are not built), and a reader who opened the Workbook expecting
// verse cards should not be met with proof cards they did not ask for.
//
// What the flag gates is *authoring* — the Logic section of the toolbar, which
// is the only way to create a proof card. It deliberately does not gate
// rendering or verification: a saved workbook containing a proof must still
// open, draw and check correctly whatever this is set to, or turning the flag
// off would silently break someone's file. See `logicToolbarVisible` in
// WorkbookBoard.svelte for the one concession to that.

import { writable } from 'svelte/store';

const STORAGE_KEY = 'workbook-logic-pipeline';

/**
 * A build-time override, so a dev build or a CI run can force the dialect on
 * without touching the user's own setting: `VITE_LOGIC_PIPELINE=1 npm run dev`.
 * Only `1`/`true` force it on; anything else defers to the stored preference.
 */
function envOverride(): boolean {
    try {
        const raw = import.meta.env?.VITE_LOGIC_PIPELINE;
        return raw === '1' || raw === 'true';
    } catch {
        return false;
    }
}

function load(): boolean {
    if (envOverride()) return true;
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        // Private mode, a disabled store, or a non-browser context (the test
        // runner) — off is the safe answer and never throws.
        return false;
    }
}

const _enabled = writable<boolean>(load());

/**
 * Whether proof cards may be authored. Same shape as the app's other persisted
 * preferences (see `aiTextDefaultModel`): a read-only `subscribe` plus an
 * explicit `set` that writes through.
 */
export const logicPipelineEnabled = {
    subscribe: _enabled.subscribe,
    set(value: boolean) {
        try {
            localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
        } catch {
            /* ignore — the in-memory value below still takes effect */
        }
        // The env override wins for the session, so a forced-on build does not
        // appear to turn off when the setting is toggled.
        _enabled.set(envOverride() ? true : value);
    },
    /** True when a build-time override is pinning this on, so the UI can say so. */
    forced: envOverride,
};

/**
 * Whether the Logic toolbar section should be offered for a given board.
 *
 * Lives here rather than in the board component so the rule that matters —
 * a board holding proof cards keeps its toolbar even when the flag is off —
 * can be asserted directly. Without that carve-out, turning the flag off
 * would leave a saved proof visible on screen and impossible to extend,
 * which reads as data loss even though nothing was lost.
 */
export function logicToolbarVisibleFor(
    enabled: boolean,
    nodes: readonly { kind: string }[],
): boolean {
    return enabled || nodes.some((n) => n.kind === 'logic');
}
