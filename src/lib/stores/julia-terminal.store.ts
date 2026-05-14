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

// ── Julia incompleteness check ───────────────────────────────────────────────

/**
 * Returns true if `code` is not yet a complete Julia expression — unmatched
 * `(`, `[`, `{`, an unclosed string/char literal, or a block keyword
 * (function/if/for/while/let/begin/do/try/module/quote/macro/struct) without
 * its matching `end`. Comments and strings are skipped during the scan.
 * Conservative: returns false when in doubt.
 */
export function isIncompleteJulia(code: string): boolean {
    let paren = 0, bracket = 0, brace = 0;
    let inStr = false, triple = false, inChar = false;
    let strInterpDepth = 0;
    let i = 0;
    const n = code.length;

    while (i < n) {
        const c = code[i];
        const next = code[i + 1] ?? '';

        if (inStr) {
            if (c === '\\') { i += 2; continue; }
            if (triple && c === '"' && next === '"' && code[i + 2] === '"') {
                inStr = false; triple = false; i += 3; continue;
            }
            if (!triple && c === '"') { inStr = false; i++; continue; }
            if (c === '$' && next === '(') { strInterpDepth++; paren++; i += 2; continue; }
            i++; continue;
        }
        if (inChar) {
            if (c === '\\') { i += 2; continue; }
            if (c === "'") { inChar = false; i++; continue; }
            i++; continue;
        }

        if (c === '#' && next === '=') {
            i += 2;
            while (i < n && !(code[i] === '=' && code[i + 1] === '#')) i++;
            i += 2; continue;
        }
        if (c === '#') {
            while (i < n && code[i] !== '\n') i++;
            continue;
        }

        if (c === '"' && next === '"' && code[i + 2] === '"') {
            inStr = true; triple = true; i += 3; continue;
        }
        if (c === '"') { inStr = true; triple = false; i++; continue; }
        if (c === "'") {
            const prev = code[i - 1] ?? '';
            if (!/[A-Za-z0-9_)\]}.]/.test(prev)) { inChar = true; i++; continue; }
            i++; continue;
        }

        if (c === '(') { paren++; i++; continue; }
        if (c === ')') {
            if (strInterpDepth > 0 && paren > 0) strInterpDepth--;
            paren--; i++; continue;
        }
        if (c === '[') { bracket++; i++; continue; }
        if (c === ']') { bracket--; i++; continue; }
        if (c === '{') { brace++; i++; continue; }
        if (c === '}') { brace--; i++; continue; }
        i++;
    }

    const stripped = code
        .replace(/#=[\s\S]*?=#/g, ' ')
        .replace(/#[^\n]*/g, ' ')
        .replace(/"""[\s\S]*?"""/g, ' ')
        .replace(/"(?:[^"\\]|\\.)*"/g, ' ');
    const startsRe = /\b(function|if|for|while|let|begin|do|try|module|quote|macro|struct)\b/g;
    let starts = 0;
    while (startsRe.exec(stripped) !== null) starts++;
    const ends = (stripped.match(/\bend\b/g) ?? []).length;

    if (inStr || inChar) return true;
    if (paren > 0 || bracket > 0 || brace > 0) return true;
    if (starts - ends > 0) return true;
    return false;
}

// ── Shared execute helper (used by both JuliaEditor keymap and JuliaReplPane) ─

export type ReplMode = 'julia' | 'pkg' | 'shell';

/**
 * Wrap user input for non-Julia modes so the underlying Julia process can
 * still execute it. Pkg uses Pkg.REPLMode.pkgstr; shell uses run(`sh -c …`)
 * with proper escaping. Multi-line input is collapsed to a single command.
 */
function wrapForMode(snippet: string, mode: ReplMode): string {
    if (mode === 'julia') return snippet;
    const oneLine = snippet.replace(/\n/g, ' ').trim();
    if (mode === 'pkg') {
        const escaped = oneLine.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        // pkgstr() emits a "Pkg REPL mode is intended for interactive use only"
        // @warn each call. Pkg's normal output goes through println/printstyled,
        // not the logging system, so raising the log threshold to Error for the
        // duration of this single call hides the noise without dropping any
        // actual Pkg output.
        return [
            `import Pkg, Logging`,
            `Logging.with_logger(Logging.ConsoleLogger(stderr, Logging.Error)) do`,
            `    Pkg.REPLMode.pkgstr("${escaped}")`,
            `end`,
        ].join('\n');
    }
    // shell mode
    const escaped = oneLine.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const shellArr = (typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent))
        ? `["cmd", "/C", "${escaped}"]`
        : `["sh", "-c", "${escaped}"]`;
    return `run(Cmd(String[${shellArr.slice(1, -1)}]))`;
}

export async function executeJuliaCode(
    snippet: string,
    onStart?: () => void,
    mode: ReplMode = 'julia',
): Promise<void> {
    // Lazy import to avoid circular deps at module load time
    const { juliaReplHistory, juliaReplStarted } = await import('./editor.store');

    snippet = snippet.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!snippet.trim()) return;

    juliaIsRunning.set(true);
    onStart?.();

    juliaReplHistory.update(h => [...h, { text: snippet, kind: 'input' as const, mode }]);

    if (!get(juliaReplStarted)) {
        const { openFolderPath } = await import('./tabs.store');
        await invoke('start_julia_repl', { cwd: get(openFolderPath) });
        juliaReplStarted.set(true);
    }
    await invoke('run_julia_code', { code: wrapForMode(snippet, mode) });
}
