import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

// ── Stores ────────────────────────────────────────────────────────────────────

/**
 * A group of Julia editors sharing split view. tabA/tabB stack in the left
 * column; the optional tabC stacks on top of the shared REPL in the right
 * column, giving a quad layout:
 *
 *     tabA | tabC
 *     tabB | repl
 */
export type JuliaGroup = {
    id: string;       // unique group id
    tabA: string;     // first tab id  (left column, top)
    tabB: string;     // second tab id (left column, bottom)
    tabC?: string;    // optional third tab (right column, above the REPL)
    colorIdx: number; // index into GROUP_COLORS palette
};

export const juliaGroups = writable<JuliaGroup[]>([]);

/** All tab ids that belong to a Julia group (including the optional third). */
export function juliaGroupMembers(g: JuliaGroup): string[] {
    return g.tabC ? [g.tabA, g.tabB, g.tabC] : [g.tabA, g.tabB];
}

export function createJuliaGroup(tabA: string, tabB: string): void {
    juliaGroups.update(gs => {
        const usedColors = new Set(gs.map(g => g.colorIdx));
        let colorIdx = 0;
        while (usedColors.has(colorIdx)) colorIdx++;
        return [...gs, { id: crypto.randomUUID(), tabA, tabB, colorIdx }];
    });
}

/** Attach a third Julia file to an existing group (right column, above REPL). */
export function addThirdToJuliaGroup(groupId: string, tabC: string): void {
    juliaGroups.update(gs =>
        gs.map(g => (g.id === groupId ? { ...g, tabC } : g)),
    );
}

/** Detach the third Julia file, leaving the two-file split intact. */
export function detachThirdFromJuliaGroup(groupId: string): void {
    juliaGroups.update(gs =>
        gs.map(g => (g.id === groupId ? { ...g, tabC: undefined } : g)),
    );
}

export function removeJuliaGroup(groupId: string): void {
    juliaGroups.update(gs => gs.filter(g => g.id !== groupId));
}

export function removeJuliaGroupByTab(tabId: string): void {
    juliaGroups.update(gs =>
        gs
            // Closing the third file degrades the group back to a two-file split…
            .map(g => (g.tabC === tabId ? { ...g, tabC: undefined } : g))
            // …but closing either primary file dissolves the whole group.
            .filter(g => g.tabA !== tabId && g.tabB !== tabId),
    );
}

/**
 * A group of Typst editors sharing split view — structurally identical to a
 * JuliaGroup, but the fourth pane is the shared Typst preview (which follows
 * whichever member is the active tab) instead of the REPL:
 *
 *     tabA | tabC
 *     tabB | preview
 */
export type TypstGroup = {
    id: string;
    tabA: string;
    tabB: string;
    tabC?: string;
    colorIdx: number;
};

export const typstGroups = writable<TypstGroup[]>([]);

export function typstGroupMembers(g: TypstGroup): string[] {
    return g.tabC ? [g.tabA, g.tabB, g.tabC] : [g.tabA, g.tabB];
}

export function createTypstGroup(tabA: string, tabB: string): void {
    typstGroups.update(gs => {
        const usedColors = new Set(gs.map(g => g.colorIdx));
        let colorIdx = 0;
        while (usedColors.has(colorIdx)) colorIdx++;
        return [...gs, { id: crypto.randomUUID(), tabA, tabB, colorIdx }];
    });
}

export function addThirdToTypstGroup(groupId: string, tabC: string): void {
    typstGroups.update(gs =>
        gs.map(g => (g.id === groupId ? { ...g, tabC } : g)),
    );
}

export function detachThirdFromTypstGroup(groupId: string): void {
    typstGroups.update(gs =>
        gs.map(g => (g.id === groupId ? { ...g, tabC: undefined } : g)),
    );
}

export function removeTypstGroup(groupId: string): void {
    typstGroups.update(gs => gs.filter(g => g.id !== groupId));
}

export function removeTypstGroupByTab(tabId: string): void {
    typstGroups.update(gs =>
        gs
            .map(g => (g.tabC === tabId ? { ...g, tabC: undefined } : g))
            .filter(g => g.tabA !== tabId && g.tabB !== tabId),
    );
}

/**
 * A group of Lean editors sharing split view — structurally identical to a
 * TypstGroup, but the fourth pane is the shared Lean infoview (which follows
 * whichever member is the active tab) instead of the preview:
 *
 *     tabA | tabC
 *     tabB | infoview
 */
export type LeanGroup = {
    id: string;
    tabA: string;
    tabB: string;
    tabC?: string;
    colorIdx: number;
};

export const leanGroups = writable<LeanGroup[]>([]);

export function leanGroupMembers(g: LeanGroup): string[] {
    return g.tabC ? [g.tabA, g.tabB, g.tabC] : [g.tabA, g.tabB];
}

export function createLeanGroup(tabA: string, tabB: string): void {
    leanGroups.update(gs => {
        const usedColors = new Set(gs.map(g => g.colorIdx));
        let colorIdx = 0;
        while (usedColors.has(colorIdx)) colorIdx++;
        return [...gs, { id: crypto.randomUUID(), tabA, tabB, colorIdx }];
    });
}

export function addThirdToLeanGroup(groupId: string, tabC: string): void {
    leanGroups.update(gs =>
        gs.map(g => (g.id === groupId ? { ...g, tabC } : g)),
    );
}

export function detachThirdFromLeanGroup(groupId: string): void {
    leanGroups.update(gs =>
        gs.map(g => (g.id === groupId ? { ...g, tabC: undefined } : g)),
    );
}

export function removeLeanGroup(groupId: string): void {
    leanGroups.update(gs => gs.filter(g => g.id !== groupId));
}

export function removeLeanGroupByTab(tabId: string): void {
    leanGroups.update(gs =>
        gs
            .map(g => (g.tabC === tabId ? { ...g, tabC: undefined } : g))
            .filter(g => g.tabA !== tabId && g.tabB !== tabId),
    );
}

/**
 * A paired group where any editor type (Julia/Typst/Lean/Lexical) can be the
 * host. hostTabId stays in the sidebar; partnerTabId goes to the left panel.
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
    const blockTokenRe = /[()[\]{}]|\b(function|if|for|while|let|begin|do|try|module|quote|macro|struct|end)\b/g;
    let starts = 0;
    let ends = 0;
    let blockParen = 0, blockBracket = 0, blockBrace = 0;
    for (const match of stripped.matchAll(blockTokenRe)) {
        const token = match[0];
        if (token === '(') { blockParen++; continue; }
        if (token === ')') { blockParen--; continue; }
        if (token === '[') { blockBracket++; continue; }
        if (token === ']') { blockBracket--; continue; }
        if (token === '{') { blockBrace++; continue; }
        if (token === '}') { blockBrace--; continue; }
        if (token === 'end') { ends++; continue; }
        // Comprehensions and generators use `for` without a matching `end`.
        if (token === 'for' && (blockParen > 0 || blockBracket > 0 || blockBrace > 0)) continue;
        starts++;
    }

    if (inStr || inChar) return true;
    if (paren > 0 || bracket > 0 || brace > 0) return true;
    if (starts - ends > 0) return true;
    return false;
}

// ── Shared execute helper (used by both JuliaEditor keymap and JuliaReplPane) ─

export type ReplMode = 'julia' | 'pkg' | 'shell' | 'help';

/**
 * Wrap user input for non-Julia modes so the underlying Julia process can
 * still execute it. Pkg uses Pkg.REPLMode.pkgstr; shell uses run(`sh -c …`)
 * with proper escaping. Help uses @doc. Multi-line input is collapsed to a
 * single command.
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
    if (mode === 'help') {
        // @doc <name> returns a Markdown.MD object which _ALDisplay renders as
        // plain text via show(stdout, MIME("text/plain"), result).
        return `@doc ${oneLine}`;
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
    const { pushReplLines, juliaReplStarted } = await import('./editor.store');

    snippet = snippet.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!snippet.trim()) return;

    juliaIsRunning.set(true);
    onStart?.();

    pushReplLines({ text: snippet, kind: 'input' as const, mode });

    try {
        if (!get(juliaReplStarted)) {
            // Verify Julia exists before spawning the REPL. Without this guard a
            // missing binary rejects `start_julia_repl`, leaving `juliaIsRunning`
            // stuck true (spinner forever) and surfacing as an unhandled rejection.
            const status = await invoke<string>('check_julia');
            if (status !== 'installed') {
                juliaIsRunning.set(false);
                pushReplLines({ text: 'Julia is not installed.', kind: 'error' as const });
                const { openJuliaInstallPrompt } = await import('./julia-install.store');
                openJuliaInstallPrompt();
                return;
            }
            const { openFolderPath } = await import('./tabs.store');
            await invoke('start_julia_repl', { cwd: get(openFolderPath) });
            juliaReplStarted.set(true);
        }
        await invoke('run_julia_code', { code: wrapForMode(snippet, mode) });
    } catch (e) {
        // Stop the spinner and report the failure inline instead of letting the
        // rejection go unhandled.
        juliaIsRunning.set(false);
        const msg = String(e);
        pushReplLines({ text: msg, kind: 'error' as const });
        if (/not installed|set the path/i.test(msg)) {
            const { openJuliaInstallPrompt } = await import('./julia-install.store');
            openJuliaInstallPrompt();
        }
    }
}
