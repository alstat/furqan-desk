/**
 * Lean 4 compile runtimes.
 *
 * Lean is a batch compiler, not a REPL: there is no persistent session to feed
 * statements into, so "running" Lean code means elaborating the whole buffer
 * and reading back the messages. `lean --json` reports those as diagnostics —
 * errors, warnings, and the `information` messages that carry `#eval` /
 * `#check` output — which is exactly what VS Code's Lean Infoview renders.
 *
 * Two runtimes exist and never share state, matching how the Julia kernels are
 * split:
 *   • `leanEditorRuntime` (kernel `"repl"`) backs the standalone .lean editor
 *   • `leanCellRuntime`   (kernel `"cell"`) backs the Lexical editor's cells
 * Each has its own scratch directory and its own in-flight process on the Rust
 * side, so a compile in one can never cancel or contaminate the other.
 */
import { writable, get, type Writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { browser } from '$app/environment';

export type LeanSeverity = 'error' | 'warning' | 'information';

export interface LeanDiagnostic {
    severity: LeanSeverity;
    /** 1-based line, 0-based column — Lean's own convention. */
    line: number;
    column: number;
    end_line: number;
    end_column: number;
    message: string;
}

export interface LeanCompileResult {
    diagnostics: LeanDiagnostic[];
    /** Output that wasn't a diagnostic (panics, front-end errors, `main` stdout). */
    raw: string;
    ok: boolean;
    elapsed_ms: number;
    /** True when a newer request superseded this one — discard the result. */
    cancelled: boolean;
    /** True when the compile was killed for running too long. */
    timed_out: boolean;
}

export type LeanStatus =
    /** Nothing compiled yet in this runtime. */
    | 'idle'
    /** A compile is in flight. */
    | 'compiling'
    /** Finished with no errors. */
    | 'ok'
    /** Finished with at least one error diagnostic. */
    | 'error'
    /** Couldn't run at all (Lean missing, spawn failed). */
    | 'unavailable';

/** How long typing must pause before live mode fires a compile. */
export const LIVE_COMPILE_DEBOUNCE_MS = 700;

export interface LeanRuntime {
    readonly kernel: string;
    /** Messages from the most recent completed compile. */
    diagnostics: Writable<LeanDiagnostic[]>;
    /** Non-diagnostic output from the most recent compile. */
    raw: Writable<string>;
    status: Writable<LeanStatus>;
    /** Wall-clock duration of the last compile, in milliseconds. */
    elapsedMs: Writable<number>;
    /** Transport-level failure (Lean not installed, spawn error) — not a
     *  diagnostic, so it is surfaced separately from the message list. */
    errorMessage: Writable<string>;
    /** `Date.now()` of the last completed compile, or 0 if never. */
    lastCompiledAt: Writable<number>;

    /** Compile now, cancelling anything already running in this runtime. */
    compile(code: string): Promise<LeanCompileResult | null>;
    /** Debounced compile, for live mode. Safe to call on every keystroke. */
    scheduleCompile(code: string, delayMs?: number): void;
    /** Drop any pending debounce and kill the in-flight process. */
    cancel(): Promise<void>;
    /** Reset the runtime's visible state back to `idle`. */
    clear(): void;

    /**
     * Point the runtime at a tab, clearing stale messages when it differs from
     * the tab the current ones describe. A split shares one runtime between
     * several editors, and a diagnostic's line/column only means anything
     * against the file it came from — showing tabA's errors over tabB would
     * anchor them to unrelated lines.
     */
    focusTab(tabId: string | null): void;

    /**
     * Register a mounted editor, returning its release function.
     *
     * Editors cancel the runtime when they unmount, but a split mounts two or
     * three at once: without refcounting, closing the third pane would kill a
     * compile the first pane started. Only the last one out cancels.
     */
    retain(): () => void;
}

function createLeanRuntime(kernel: string): LeanRuntime {
    const diagnostics = writable<LeanDiagnostic[]>([]);
    const raw = writable('');
    const status = writable<LeanStatus>('idle');
    const elapsedMs = writable(0);
    const errorMessage = writable('');
    const lastCompiledAt = writable(0);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    /** Guards against an older in-flight compile overwriting a newer result:
     *  the Rust side already cancels superseded processes, but a request that
     *  finishes during the gap would still resolve here. */
    let generation = 0;

    async function compile(code: string): Promise<LeanCompileResult | null> {
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }

        const mine = ++generation;
        status.set('compiling');
        errorMessage.set('');

        try {
            const result = await invoke<LeanCompileResult>('lean_compile', {
                code,
                kernel,
            });

            // Superseded — either by the Rust side or by a later call here.
            if (result.cancelled || mine !== generation) return null;

            diagnostics.set(result.diagnostics);
            raw.set(result.raw);
            elapsedMs.set(result.elapsed_ms);
            lastCompiledAt.set(Date.now());
            status.set(result.ok ? 'ok' : 'error');
            return result;
        } catch (e) {
            if (mine !== generation) return null;
            const msg = typeof e === 'string' ? e : String(e);
            diagnostics.set([]);
            raw.set('');
            errorMessage.set(msg);
            status.set('unavailable');
            // A missing toolchain is the one failure the user can fix from
            // here, so offer the installer rather than just reporting it.
            if (/not installed|set the path/i.test(msg)) {
                const { openLeanInstallPrompt } = await import('./lean-install.store');
                openLeanInstallPrompt();
            }
            return null;
        }
    }

    function scheduleCompile(code: string, delayMs = LIVE_COMPILE_DEBOUNCE_MS): void {
        if (debounceTimer !== null) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void compile(code);
        }, delayMs);
    }

    async function cancel(): Promise<void> {
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        // Bump the generation so a compile already in flight can't land.
        generation++;
        if (get(status) === 'compiling') status.set('idle');
        try {
            await invoke('cancel_lean_compile', { kernel });
        } catch {
            // Nothing was running — the common case, and harmless.
        }
    }

    /** Tab whose source produced the messages currently on display. */
    let focusedTabId: string | null = null;

    function focusTab(tabId: string | null): void {
        if (tabId === focusedTabId) return;
        focusedTabId = tabId;
        // Also drops anything in flight — it describes the tab we just left.
        clear();
    }

    let mounted = 0;

    function retain(): () => void {
        mounted++;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            mounted--;
            if (mounted <= 0) {
                mounted = 0;
                void cancel();
            }
        };
    }

    function clear(): void {
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        generation++;
        diagnostics.set([]);
        raw.set('');
        elapsedMs.set(0);
        errorMessage.set('');
        lastCompiledAt.set(0);
        status.set('idle');
    }

    return {
        kernel,
        diagnostics,
        raw,
        status,
        elapsedMs,
        errorMessage,
        lastCompiledAt,
        compile,
        scheduleCompile,
        cancel,
        clear,
        focusTab,
        retain,
    };
}

/** Runtime behind the standalone .lean file editor's infoview. */
export const leanEditorRuntime = createLeanRuntime('repl');

/** Runtime behind the Lexical editor's Lean code cells. */
export const leanCellRuntime = createLeanRuntime('cell');

// ── Live-compilation toggle (editor infoview) ────────────────────────────────

function readBool(key: string, fallback: boolean): boolean {
    if (!browser) return fallback;
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === 'true';
}

/**
 * Whether the .lean editor recompiles as you type. Off by default: a compile
 * spawns a process and elaborates the whole file, which is fine on a small
 * buffer but noticeable on one that imports Mathlib.
 */
export const leanLiveCompile = writable(readBool('leanLiveCompile', false));
leanLiveCompile.subscribe((v) => {
    if (browser) localStorage.setItem('leanLiveCompile', String(v));
});

// ── Helpers shared by the infoview and the cells ─────────────────────────────

/** Order used when grouping messages: errors first, then warnings, then info. */
const SEVERITY_RANK: Record<LeanSeverity, number> = {
    error: 0,
    warning: 1,
    information: 2,
};

export function sortDiagnostics(diags: LeanDiagnostic[]): LeanDiagnostic[] {
    return [...diags].sort(
        (a, b) =>
            SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
            a.line - b.line ||
            a.column - b.column,
    );
}

export function countBySeverity(
    diags: LeanDiagnostic[],
): { errors: number; warnings: number; infos: number } {
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    for (const d of diags) {
        if (d.severity === 'error') errors++;
        else if (d.severity === 'warning') warnings++;
        else infos++;
    }
    return { errors, warnings, infos };
}
