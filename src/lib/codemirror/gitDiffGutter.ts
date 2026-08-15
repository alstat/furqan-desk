import { StateField, StateEffect, type Extension, type Transaction } from '@codemirror/state';
import { EditorView, gutter, GutterMarker, ViewPlugin, type ViewUpdate } from '@codemirror/view';

export const setGitBaseline = StateEffect.define<string | null>();

type LineStatus = 'added' | 'modified' | 'deletedAbove' | 'deletedBelow';

/** Result of a (debounced, off-transaction) diff run — see `diffRunner`. */
const setDiffResult = StateEffect.define<Map<number, LineStatus>>();

interface DiffState {
    baseline: string | null;
    byLine: Map<number, LineStatus>;
    /** Bumped whenever a fresh diff is needed; watched by `diffRunner`. */
    stale: number;
}

class StatusMarker extends GutterMarker {
    constructor(readonly cls: string) { super(); }
    override toDOM() {
        const el = document.createElement('div');
        el.className = this.cls;
        return el;
    }
}

const addedMarker = new StatusMarker('cm-gitDiff-bar cm-gitDiff-added');
const modifiedMarker = new StatusMarker('cm-gitDiff-bar cm-gitDiff-modified');
const deletedAboveMarker = new StatusMarker('cm-gitDiff-bar cm-gitDiff-deletedAbove');
const deletedBelowMarker = new StatusMarker('cm-gitDiff-bar cm-gitDiff-deletedBelow');
const spacerMarker = new StatusMarker('cm-gitDiff-bar');

function diffLines(base: string, current: string): Map<number, LineStatus> {
    const result = new Map<number, LineStatus>();
    // Empty baseline = untracked (or empty-at-HEAD) file: every line is new.
    // Without this special case the LCS pairing below would render line 1 as
    // "modified" (paired against the baseline's single empty line).
    if (base === '') {
        if (current === '') return result;
        const lines = current.split('\n').length;
        for (let j = 1; j <= lines; j++) result.set(j, 'added');
        return result;
    }
    const a = base.split('\n');
    const b = current.split('\n');
    const aLines = a.length, bLines = b.length;

    // Trim the identical head and tail before running the LCS. An edit touches
    // one line or a small run of them, so the quadratic part then only sees the
    // region that actually differs — which is what keeps this affordable on a
    // file of any length. `lo` is how many leading lines matched; `n`/`m` are
    // the sizes of the differing middles of `a` and `b`.
    let lo = 0;
    while (lo < aLines && lo < bLines && a[lo] === b[lo]) lo++;
    let hi = 0;
    while (
        hi < aLines - lo &&
        hi < bLines - lo &&
        a[aLines - 1 - hi] === b[bLines - 1 - hi]
    ) hi++;

    const n = aLines - lo - hi;
    const m = bLines - lo - hi;
    if (n === 0 && m === 0) return result; // identical documents
    // Bail out for pathological cases to avoid quadratic memory cost.
    if (n * m > 2_000_000) return result;

    const w = m + 1;
    const dp = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
        const row = i * w;
        const nextRow = (i + 1) * w;
        const ai = a[lo + i];
        for (let j = m - 1; j >= 0; j--) {
            dp[row + j] = ai === b[lo + j]
                ? dp[nextRow + (j + 1)] + 1
                : Math.max(dp[nextRow + j], dp[row + (j + 1)]);
        }
    }

    // `line` values below are indices into the trimmed middle of `b`; `lo` is
    // added back when they are written out as document line numbers.
    type Op = { type: 'eq' | 'add' | 'del'; line: number };
    const ops: Op[] = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (a[lo + i] === b[lo + j]) { ops.push({ type: 'eq', line: j }); i++; j++; }
        else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) { ops.push({ type: 'del', line: j }); i++; }
        else { ops.push({ type: 'add', line: j }); j++; }
    }
    while (i < n) { ops.push({ type: 'del', line: j }); i++; }
    while (j < m) { ops.push({ type: 'add', line: j }); j++; }

    let k = 0;
    while (k < ops.length) {
        if (ops[k].type === 'eq') { k++; continue; }
        let dels = 0;
        const adds: number[] = [];
        while (k < ops.length && ops[k].type !== 'eq') {
            if (ops[k].type === 'del') dels++;
            else adds.push(ops[k].line);
            k++;
        }
        const paired = Math.min(dels, adds.length);
        for (let p = 0; p < paired; p++) result.set(lo + adds[p] + 1, 'modified');
        for (let p = paired; p < adds.length; p++) result.set(lo + adds[p] + 1, 'added');
        const extraDels = dels - paired;
        if (extraDels > 0 && adds.length === 0) {
            const nextEq = ops[k];
            if (nextEq && nextEq.type === 'eq') {
                result.set(lo + nextEq.line + 1, 'deletedAbove');
            } else if (hi > 0) {
                // The trimmed tail follows, so the deletion sits above its
                // first line rather than at the end of the document.
                result.set(lo + m + 1, 'deletedAbove');
            } else if (bLines > 0) {
                result.set(bLines, 'deletedBelow');
            }
        }
    }
    return result;
}

/**
 * Shift recorded line numbers through a document change so the existing bars
 * stay put while the debounced recompute is pending. Cheap relative to the
 * diff itself, and skipped outright when nearly every line is marked (a
 * freshly added file), where the bars cannot meaningfully move anyway.
 */
const REMAP_LIMIT = 5000;

function remapLines(
    byLine: Map<number, LineStatus>,
    tr: Transaction,
): Map<number, LineStatus> {
    if (byLine.size === 0 || byLine.size > REMAP_LIMIT) return byLine;
    const oldDoc = tr.startState.doc;
    const newDoc = tr.state.doc;
    const out = new Map<number, LineStatus>();
    for (const [lineNum, status] of byLine) {
        if (lineNum < 1 || lineNum > oldDoc.lines) continue;
        const pos = tr.changes.mapPos(oldDoc.line(lineNum).from, 1);
        if (pos < 0 || pos > newDoc.length) continue;
        out.set(newDoc.lineAt(pos).number, status);
    }
    return out;
}

// The diff itself never runs inside the transaction: on a large file it is
// milliseconds of work plus a multi-megabyte scratch buffer, and paying that on
// the keystroke path is what made typing feel heavy. The field only tracks
// *that* a new diff is owed (`stale`); `diffRunner` computes it off the hot
// path and feeds the answer back through `setDiffResult`.
const diffField = StateField.define<DiffState>({
    create: () => ({ baseline: null, byLine: new Map(), stale: 0 }),
    update(value, tr) {
        let baseline = value.baseline;
        let baselineChanged = false;
        let computed: Map<number, LineStatus> | null = null;
        for (const effect of tr.effects) {
            if (effect.is(setGitBaseline)) {
                baseline = effect.value;
                baselineChanged = true;
            } else if (effect.is(setDiffResult)) {
                computed = effect.value;
            }
        }

        if (baselineChanged) {
            // A null baseline disables the gutter outright — nothing to run.
            return baseline == null
                ? { baseline, byLine: new Map(), stale: value.stale }
                : { baseline, byLine: new Map(), stale: value.stale + 1 };
        }
        if (computed) return { baseline, byLine: computed, stale: value.stale };
        if (!tr.docChanged || baseline == null) return value;
        return {
            baseline,
            byLine: remapLines(value.byLine, tr),
            stale: value.stale + 1,
        };
    },
});

/** How long to let edits settle before re-diffing against HEAD. */
const DIFF_DEBOUNCE_MS = 220;

const diffRunner = ViewPlugin.fromClass(
    class {
        timer: ReturnType<typeof setTimeout> | undefined;
        /** `stale` value of the last diff actually computed. */
        lastStale = -1;

        constructor(private readonly view: EditorView) {
            this.schedule(DIFF_DEBOUNCE_MS);
        }

        update(u: ViewUpdate) {
            const state = u.state.field(diffField, false);
            if (!state || state.stale === this.lastStale) return;
            // A newly arrived baseline should paint immediately (the file just
            // opened); ongoing edits get the debounce.
            const fresh = u.transactions.some((tr) =>
                tr.effects.some((e) => e.is(setGitBaseline)),
            );
            this.schedule(fresh ? 0 : DIFF_DEBOUNCE_MS);
        }

        schedule(delay: number) {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.run(), delay);
        }

        run() {
            const state = this.view.state.field(diffField, false);
            if (!state) return;
            // Read `stale` and the document in the same tick so they agree.
            this.lastStale = state.stale;
            if (state.baseline == null) return;
            const byLine = diffLines(
                state.baseline,
                this.view.state.doc.toString(),
            );
            this.view.dispatch({ effects: setDiffResult.of(byLine) });
        }

        destroy() {
            clearTimeout(this.timer);
        }
    },
);

const diffGutter = gutter({
    class: 'cm-gitDiff-gutter',
    lineMarker(view, line) {
        const state = view.state.field(diffField, false);
        if (!state || state.baseline == null) return null;
        const lineNum = view.state.doc.lineAt(line.from).number;
        const status = state.byLine.get(lineNum);
        switch (status) {
            case 'added': return addedMarker;
            case 'modified': return modifiedMarker;
            case 'deletedAbove': return deletedAboveMarker;
            case 'deletedBelow': return deletedBelowMarker;
            default: return null;
        }
    },
    // By default the gutter only recomputes markers on doc/viewport changes, so a
    // baseline update (an effect-only transaction, e.g. when the git HEAD for a
    // freshly-activated tab finishes loading) would leave stale bars until the
    // next interaction. Refresh whenever the diff state changes identity.
    lineMarkerChange: (update) =>
        update.startState.field(diffField, false) !==
        update.state.field(diffField, false),
    initialSpacer: () => spacerMarker,
});

const diffTheme = EditorView.baseTheme({
    '.cm-gitDiff-gutter': {
        width: '3px',
        padding: '0',
        backgroundColor: 'transparent',
        border: 'none',
        overflow: 'visible',
    },
    '.cm-gitDiff-gutter .cm-gutterElement': {
        padding: '0',
        position: 'relative',
        overflow: 'visible',
    },
    '.cm-gitDiff-bar': { width: '3px', height: '100%' },
    '.cm-gitDiff-added': { backgroundColor: '#3fb950' },
    '.cm-gitDiff-modified': { backgroundColor: '#d29922' },
    // Deletions render as a small right-pointing red triangle anchored at the
    // line seam (top edge for a deletion above, bottom edge for one below),
    // matching the affordance used by VS Code / Zed.
    '.cm-gitDiff-deletedAbove, .cm-gitDiff-deletedBelow': {
        position: 'absolute',
        left: '0',
        width: '0',
        height: '0',
        borderTop: '4px solid transparent',
        borderBottom: '4px solid transparent',
        borderLeft: '6px solid #f85149',
        backgroundColor: 'transparent',
    },
    '.cm-gitDiff-deletedAbove': { top: '-4px' },
    '.cm-gitDiff-deletedBelow': { bottom: '-4px' },
});

export function gitDiffGutter(): Extension {
    return [diffField, diffRunner, diffGutter, diffTheme];
}

// ── Overview ruler ──────────────────────────────────────────────────────────
// A full-height strip pinned to the editor's right edge that plots every
// changed line at its proportional position in the document — like VS Code's
// overview ruler. It overlays the scrollbar lane purely visually
// (pointer-events: none) so the real scrollbar keeps working underneath; you
// see where the edits are and drag the scrollbar straight to them.

const overviewStatusClass: Record<LineStatus, string> = {
    added: 'cm-gitDiff-overview-added',
    modified: 'cm-gitDiff-overview-modified',
    deletedAbove: 'cm-gitDiff-overview-deleted',
    deletedBelow: 'cm-gitDiff-overview-deleted',
};

class OverviewRuler {
    readonly dom: HTMLElement;
    /** Diff state and content height the current marks were drawn from. */
    private renderedFor: DiffState | null = null;
    private renderedHeight = -1;

    constructor(private readonly view: EditorView) {
        this.dom = document.createElement('div');
        this.dom.className = 'cm-gitDiff-overview';
        view.dom.appendChild(this.dom);
        this.render();
    }

    update(update: ViewUpdate) {
        // Marks are positioned as a percentage of the total content height, so
        // scrolling cannot move them — only a different diff or a change in
        // document height can. Re-rendering on viewportChanged (i.e. on every
        // scroll frame) meant rebuilding the whole strip, one forced layout
        // read per changed line, just to redraw it identically.
        const state = update.state.field(diffField, false) ?? null;
        if (state !== this.renderedFor || this.view.contentHeight !== this.renderedHeight) {
            this.render();
        }
    }

    private render() {
        const state = this.view.state.field(diffField, false) ?? null;
        this.renderedFor = state;
        this.renderedHeight = this.view.contentHeight;
        this.dom.replaceChildren();
        if (!state || state.baseline == null || state.byLine.size === 0) {
            this.dom.style.display = 'none';
            return;
        }
        this.dom.style.display = '';
        const contentHeight = this.view.contentHeight;
        if (contentHeight <= 0) return;
        const doc = this.view.state.doc;
        const frag = document.createDocumentFragment();
        for (const [lineNum, status] of state.byLine) {
            if (lineNum < 1 || lineNum > doc.lines) continue;
            const top = this.view.lineBlockAt(doc.line(lineNum).from).top;
            const mark = document.createElement('div');
            mark.className = `cm-gitDiff-overview-mark ${overviewStatusClass[status]}`;
            mark.style.top = `${(top / contentHeight) * 100}%`;
            frag.appendChild(mark);
        }
        this.dom.appendChild(frag);
    }

    destroy() {
        this.dom.remove();
    }
}

const overviewPlugin = ViewPlugin.fromClass(OverviewRuler);

const overviewTheme = EditorView.baseTheme({
    // Sits over the 8px scrollbar lane on the right edge. pointer-events: none
    // keeps the underlying scrollbar fully draggable — this strip is a visual
    // map only.
    '.cm-gitDiff-overview': {
        position: 'absolute',
        top: '0',
        right: '0',
        width: '8px',
        height: '100%',
        zIndex: '5',
        pointerEvents: 'none',
    },
    '.cm-gitDiff-overview-mark': {
        position: 'absolute',
        right: '0',
        width: '100%',
        height: '3px',
        minHeight: '2px',
        borderRadius: '1px',
        opacity: '0.5',
    },
    '.cm-gitDiff-overview-added': { backgroundColor: '#3fb950' },
    '.cm-gitDiff-overview-modified': { backgroundColor: '#d29922' },
    '.cm-gitDiff-overview-deleted': { backgroundColor: '#f85149' },
});

export function gitDiffOverviewRuler(): Extension {
    // Shares `diffField` with gitDiffGutter(); CodeMirror dedupes the field by
    // reference, so including it in both extensions is safe.
    return [diffField, overviewPlugin, overviewTheme];
}
