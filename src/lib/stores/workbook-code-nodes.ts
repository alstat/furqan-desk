// Julia and Lean "processor" nodes for the Workbook — each runs the reader's
// own code against the upstream rows and hands whatever it produces back to
// the pipeline as ordinary `VerseRow[]`, so Filter/Related/View downstream
// never need to know a Qur'an row passed through code execution. That
// adapter lives entirely in this file: `dictsToVerseRows` is the one place
// "whatever Julia/Lean printed" becomes "a row workbook.store.ts understands".
//
// Both languages get the same input variable, `rows`, and are expected to
// leave their answer in `result` — a fixed convention rather than any kind
// of runtime introspection, which is also why a fresh node's placeholder
// code (`result = rows` / `def result := rows`) is already a working
// pass-through. Neither harness below needs an external Julia/Lean package:
// the app's own `__AL_CMD__` sidecar convention in julia.rs hand-builds its
// JSON with plain Julia `Base`, and this follows the same idea — a reader's
// Julia/Lean install is outside this app's control, so requiring one more
// package there would be a reliability regression, not a convenience.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { VerseRow, WorkbookNode } from './workbook.store';

const OUTPUT_MARKER = '__WB_OUT__:';

/**
 * The dedicated kernel each Workbook node runs on — one per node, isolated
 * from JuliaEditor/LeanEditor's own `"repl"` kernel, JuliaCellComponent/
 * LeanCellComponent's `"cell"` kernel, and every other Workbook node, so a
 * node's REPL/infoview toggle (see WorkbookNodeCard.svelte) always shares
 * state with — and only with — that same node's own pipeline runs.
 */
export function workbookJuliaKernel(nodeId: string): string {
    return `workbook-julia-${nodeId}`;
}
export function workbookLeanKernel(nodeId: string): string {
    return `workbook-lean-${nodeId}`;
}

// ── Shared adapter: whatever came back → VerseRow[] ─────────────────────────

function toEntryArray(value: unknown): { label: string; text: string | null }[] {
    if (Array.isArray(value)) {
        return value.map((entry) => {
            if (entry && typeof entry === 'object') {
                const e = entry as Record<string, unknown>;
                return { label: e.label == null ? '' : String(e.label), text: e.text == null ? null : String(e.text) };
            }
            return { label: '', text: entry == null ? null : String(entry) };
        });
    }
    // Lean flattens translations/tafsirs into one "label: text | label: text" string.
    if (typeof value === 'string' && value.trim()) {
        return value.split(' | ').map((part) => {
            const sep = part.indexOf(': ');
            return sep === -1 ? { label: '', text: part } : { label: part.slice(0, sep), text: part.slice(sep + 2) };
        });
    }
    return [];
}

function dictToVerseRow(value: unknown): VerseRow | null {
    if (!value || typeof value !== 'object') return null;
    const o = value as Record<string, unknown>;
    const surah = Number(o.surah);
    const ayah = Number(o.ayah);
    if (!Number.isFinite(surah) || !Number.isFinite(ayah)) return null;
    const translations = toEntryArray(o.translations);
    const tafsirs = toEntryArray(o.tafsirs);
    return {
        surah,
        ayah,
        arabic: o.arabic == null ? '' : String(o.arabic),
        translation: o.translation != null ? String(o.translation) : (translations[0]?.text ?? null),
        translations: translations.length ? translations : undefined,
        tafsir: o.tafsir != null ? String(o.tafsir) : (tafsirs[0]?.text ?? null),
        tafsirs: tafsirs.length ? tafsirs : undefined,
        fromRef: o.fromRef == null ? undefined : String(o.fromRef),
    };
}

/** Every Julia/Lean node's output goes through this — the one and only place a code result becomes real rows. */
export function dictsToVerseRows(value: unknown): VerseRow[] {
    if (!Array.isArray(value)) return [];
    const out: VerseRow[] = [];
    for (const item of value) {
        const row = dictToVerseRow(item);
        if (row) out.push(row);
    }
    return out;
}

/** Finds the harness's own output line (searched from the end, so a reader printing debug text containing the marker earlier can't shadow it) and parses its JSON payload. */
function extractOutput(text: string): unknown {
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].startsWith(OUTPUT_MARKER)) {
            return JSON.parse(lines[i].slice(OUTPUT_MARKER.length).trim());
        }
    }
    throw new Error("No output produced — make sure the code leaves its answer in `result`.");
}

// ── Julia ────────────────────────────────────────────────────────────────────

function juliaStringLiteral(s: string): string {
    return (
        '"' +
        s
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$') // Julia treats bare `$` in a string as interpolation
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r') +
        '"'
    );
}

function juliaValueLiteral(v: unknown): string {
    if (v === null || v === undefined) return 'nothing';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'nothing';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'string') return juliaStringLiteral(v);
    if (Array.isArray(v)) return '[' + v.map(juliaValueLiteral).join(',') + ']';
    if (typeof v === 'object') {
        const entries = Object.entries(v as Record<string, unknown>).map(
            ([k, val]) => `${juliaStringLiteral(k)}=>${juliaValueLiteral(val)}`,
        );
        return 'Dict(' + entries.join(',') + ')';
    }
    return 'nothing';
}

function rowToPlainObject(row: VerseRow): Record<string, unknown> {
    return {
        surah: row.surah,
        ayah: row.ayah,
        arabic: row.arabic,
        translation: row.translation ?? null,
        translations: (row.translations ?? []).map((t) => ({ label: t.label, text: t.text })),
        tafsir: row.tafsir ?? null,
        tafsirs: (row.tafsirs ?? []).map((t) => ({ label: t.label, text: t.text })),
        fromRef: row.fromRef ?? null,
    };
}

// Base-only: a Julia-value → JSON-text serializer. No JSON *parser* is ever
// needed on the Julia side — `rows` below is emitted as a real Julia
// `Dict`/`Vector` literal, which Julia's own parser reads like any other
// source, so the only new code this harness needs is the output direction.
const JULIA_HARNESS = String.raw`
function __wb_json_str(s::AbstractString)
    io = IOBuffer()
    print(io, '"')
    for c in s
        if c == '"'
            print(io, "\\\"")
        elseif c == '\\'
            print(io, "\\\\")
        elseif c == '\n'
            print(io, "\\n")
        elseif c == '\r'
            print(io, "\\r")
        elseif c == '\t'
            print(io, "\\t")
        else
            print(io, c)
        end
    end
    print(io, '"')
    return String(take!(io))
end
function __wb_to_json(x)
    if x === nothing
        return "null"
    elseif x isa Bool
        return x ? "true" : "false"
    elseif x isa Real
        return string(x)
    elseif x isa AbstractString
        return __wb_json_str(x)
    elseif x isa AbstractDict
        return "{" * join([__wb_json_str(string(k)) * ":" * __wb_to_json(v) for (k, v) in x], ",") * "}"
    elseif x isa AbstractVector
        return "[" * join([__wb_to_json(v) for v in x], ",") * "]"
    else
        return __wb_json_str(string(x))
    end
end
`;

function buildJuliaCode(node: WorkbookNode, input: VerseRow[]): string {
    const rowsLiteral = '[' + input.map((r) => juliaValueLiteral(rowToPlainObject(r))).join(',') + ']';
    return [
        JULIA_HARNESS,
        `rows = ${rowsLiteral}`,
        'result = rows',
        node.code ?? '',
        `println(stdout, "${OUTPUT_MARKER}" * __wb_to_json(result))`,
    ].join('\n');
}

// One kernel per node (`workbook-julia-<id>`) — an independent, long-lived
// Julia process, so a node's variables persist between runs like a notebook
// cell, and two Julia nodes on the same board never share state. Runs on
// the same kernel are chained so two rapid refreshes never interleave on
// the same stdin.
const kernelChains = new Map<string, Promise<unknown>>();
let outputListener: Promise<unknown> | null = null;
const sinks = new Map<string, (chunk: string, isDone: boolean, error: string | null) => void>();

function ensureOutputListener(): Promise<unknown> {
    if (!outputListener) {
        outputListener = listen<{ kernel: string; chunk: string; is_done: boolean; error: string | null }>(
            'julia-output',
            (event) => {
                sinks.get(event.payload.kernel)?.(event.payload.chunk, event.payload.is_done, event.payload.error);
            },
        );
    }
    return outputListener;
}

function runOnJuliaKernel(kernel: string, code: string): Promise<{ text: string; hasError: boolean }> {
    const prior = kernelChains.get(kernel) ?? Promise.resolve();
    const run = prior.catch(() => {}).then(async () => {
        await ensureOutputListener();
        // Idempotent on the Rust side — a no-op if this kernel is already running.
        await invoke('start_julia_repl', { cwd: undefined, kernel });
        return new Promise<{ text: string; hasError: boolean }>((resolve, reject) => {
            let text = '';
            let hasError = false;
            sinks.set(kernel, (chunk, isDone, error) => {
                if (chunk) text += text ? `\n${chunk}` : chunk;
                if (error !== null) hasError = true;
                if (isDone) {
                    sinks.delete(kernel);
                    resolve({ text, hasError });
                }
            });
            invoke('run_julia_code', { code, kernel }).catch((e) => {
                sinks.delete(kernel);
                reject(e instanceof Error ? e : new Error(String(e)));
            });
        });
    });
    kernelChains.set(kernel, run);
    return run;
}

export async function runWorkbookJulia(node: WorkbookNode, input: VerseRow[]): Promise<VerseRow[]> {
    const { text, hasError } = await runOnJuliaKernel(workbookJuliaKernel(node.id), buildJuliaCode(node, input));
    if (hasError) throw new Error(text || 'Julia run failed.');
    return dictsToVerseRows(extractOutput(text));
}

/** One ad-hoc line for the node's REPL toggle — shares state with whatever the pipeline last ran (`rows`/`result` included), since it's the same kernel. */
export function runWorkbookJuliaRepl(node: WorkbookNode, code: string): Promise<{ text: string; hasError: boolean }> {
    return runOnJuliaKernel(workbookJuliaKernel(node.id), code);
}

// ── Lean ─────────────────────────────────────────────────────────────────────

function leanStringLiteral(s: string): string {
    return (
        '"' +
        s
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t') +
        '"'
    );
}

function flattenEntries(entries: { label: string; text: string | null }[] | undefined): string {
    return (entries ?? []).map((e) => (e.label ? `${e.label}: ${e.text ?? ''}` : (e.text ?? ''))).join(' | ');
}

function rowToLeanPairs(row: VerseRow): string {
    const pairs: [string, string][] = [
        ['surah', String(row.surah)],
        ['ayah', String(row.ayah)],
        ['arabic', row.arabic ?? ''],
        ['translation', row.translation ?? ''],
        ['translations', flattenEntries(row.translations)],
        ['tafsir', row.tafsir ?? ''],
        ['tafsirs', flattenEntries(row.tafsirs)],
        ['fromRef', row.fromRef ?? ''],
    ];
    return '[' + pairs.map(([k, v]) => `(${leanStringLiteral(k)}, ${leanStringLiteral(v)})`).join(', ') + ']';
}

// `Init`-only (no `Std`/`Batteries`): every row is `List (String × String)`
// rather than a real JSON tree, since that needs nothing beyond core `List`/
// `String`/tuples and is exactly what Lean code would pattern-match over
// anyway. `wbJoin` is hand-rolled rather than relying on `String.intercalate`
// so this harness has no dependency on any wider API surface than `Init`.
const LEAN_HARNESS = String.raw`
def wbJoin (sep : String) : List String → String
  | [] => ""
  | [x] => x
  | x :: xs => x ++ sep ++ wbJoin sep xs

def wbEscape (s : String) : String :=
  wbJoin "" (s.toList.map (fun c =>
    if c == '"' then "\\\""
    else if c == '\\' then "\\\\"
    else if c == '\n' then "\\n"
    else String.mk [c]))

def wbRowToJson (row : List (String × String)) : String :=
  "{" ++ wbJoin "," (row.map (fun p => "\"" ++ wbEscape p.fst ++ "\":\"" ++ wbEscape p.snd ++ "\"")) ++ "}"

def wbToJson (rows : List (List (String × String))) : String :=
  "[" ++ wbJoin "," (rows.map wbRowToJson) ++ "]"
`;

function buildLeanCode(node: WorkbookNode, input: VerseRow[]): string {
    const rowsLiteral = '[' + input.map(rowToLeanPairs).join(', ') + ']';
    return [
        LEAN_HARNESS,
        `def rows : List (List (String × String)) := ${rowsLiteral}`,
        (node.code ?? '').trim() || 'def result := rows',
        `#eval IO.println ("${OUTPUT_MARKER}" ++ wbToJson result)`,
    ].join('\n\n');
}

interface LeanCompileResult {
    diagnostics: { severity: string; message: string }[];
    raw: string;
    ok: boolean;
}

export async function runWorkbookLean(node: WorkbookNode, input: VerseRow[]): Promise<VerseRow[]> {
    const kernel = workbookLeanKernel(node.id);
    const code = buildLeanCode(node, input);
    const result = await invoke<LeanCompileResult>('lean_compile', { code, kernel });
    const haystacks = [...result.diagnostics.map((d) => d.message), result.raw];
    for (const text of haystacks) {
        const idx = text.lastIndexOf(OUTPUT_MARKER);
        if (idx !== -1) {
            return dictsToVerseRows(JSON.parse(text.slice(idx + OUTPUT_MARKER.length).trim()));
        }
    }
    const errors = result.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
    throw new Error(errors.length ? errors.join('\n') : "No output produced — make sure the code leaves its answer in `result`.");
}
