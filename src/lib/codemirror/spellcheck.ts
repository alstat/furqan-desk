import {
    EditorView,
    Decoration,
    type DecorationSet,
    ViewPlugin,
    type ViewUpdate,
} from "@codemirror/view";
import { StateField, StateEffect, type Extension } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { get } from "svelte/store";
import {
    checkText,
    spellRevision,
    spellCheckEnabled,
    spellLanguage,
} from "$lib/stores/spellcheck.store";

export type SpellContextInfo = {
    word: string;
    from: number;
    to: number;
    x: number;
    y: number;
};

/** Whether to check the whole document (prose) or only comments/strings (code). */
export type SpellMode = "prose" | "code";

type SpellRange = { from: number; to: number };

const setSpellErrors = StateEffect.define<SpellRange[]>();

const spellMark = Decoration.mark({ class: "cm-spell-error" });

// Holds the wavy-underline decorations for the current misspellings. They are
// mapped through document changes so they track edits until the next re-check.
const spellField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
        deco = deco.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(setSpellErrors)) {
                deco = Decoration.set(
                    e.value.map((r) => spellMark.range(r.from, r.to)),
                    true,
                );
            }
        }
        return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
});

/** True if `pos` sits inside a comment or string syntax node. */
function inCommentOrString(view: EditorView, pos: number): boolean {
    let node: ReturnType<typeof syntaxTree>["topNode"] | null = syntaxTree(
        view.state,
    ).resolveInner(pos, 1);
    while (node) {
        const n = node.name.toLowerCase();
        if (n.includes("comment") || n.includes("string")) return true;
        node = node.parent;
    }
    return false;
}

/**
 * How much document either side of the viewport to include in a check, in
 * characters. Underlines are only ever *seen* inside the viewport, so checking
 * the whole file meant serialising the entire document across the Tauri bridge
 * every time typing paused — on a large file that is the dominant cost of the
 * feature. The margin is generous enough that a page of scrolling reveals
 * already-checked text rather than a lag before the underlines appear.
 */
const SPELL_MARGIN = 4000;

/** The slice of the document worth checking, snapped to whole lines. */
function checkRange(view: EditorView): { from: number; to: number } {
    const doc = view.state.doc;
    const { from, to } = view.viewport;
    return {
        from: doc.lineAt(Math.max(0, from - SPELL_MARGIN)).from,
        to: doc.lineAt(Math.min(doc.length, to + SPELL_MARGIN)).to,
    };
}

function spellChecker(mode: SpellMode): Extension {
    return ViewPlugin.fromClass(
        class {
            timer: ReturnType<typeof setTimeout> | undefined;
            unsub: () => void;
            seq = 0;
            // What the last dispatched result was computed from, so that
            // scrolling within an already-checked window costs nothing.
            lastFrom = -1;
            lastTo = -1;
            lastText: string | null = null;

            constructor(view: EditorView) {
                // The subscribe callback fires once immediately (initial check)
                // and again on every language / enabled / ignore-list change —
                // those should clear or add underlines right away, so re-check
                // on the next tick rather than after the typing debounce.
                this.unsub = spellRevision.subscribe(() =>
                    this.schedule(view, 0, true),
                );
            }

            update(u: ViewUpdate) {
                if (u.docChanged) this.schedule(u.view, 400);
                // Scrolling brings unchecked text into view; the memo below
                // makes this a no-op while inside the checked window.
                else if (u.viewportChanged) this.schedule(u.view, 250);
            }

            // A 0ms delay still defers past the current call stack (so we never
            // dispatch during view construction) while feeling instant.
            // `force` drops the memo — the dictionary or ignore list changed,
            // so the same text can now produce a different answer.
            schedule(view: EditorView, delay: number, force = false) {
                if (force) this.lastText = null;
                clearTimeout(this.timer);
                this.timer = setTimeout(() => void this.run(view), delay);
            }

            async run(view: EditorView) {
                const mySeq = ++this.seq;
                if (!get(spellCheckEnabled) || !get(spellLanguage)) {
                    this.lastText = null;
                    view.dispatch({ effects: setSpellErrors.of([]) });
                    return;
                }

                const { from, to } = checkRange(view);
                const text = view.state.sliceDoc(from, to);
                if (
                    from === this.lastFrom &&
                    to === this.lastTo &&
                    text === this.lastText
                ) {
                    return; // already showing the answer for exactly this text
                }

                const results = await checkText(text);
                // A newer run started (or the plugin was torn down) while we
                // awaited — drop this stale result. The memo is only committed
                // once a result actually reaches the view, so a dropped run
                // can't convince a later one that the work is already done.
                if (mySeq !== this.seq) return;
                this.lastFrom = from;
                this.lastTo = to;
                this.lastText = text;

                const len = view.state.doc.length;
                let ranges: SpellRange[] = results
                    .map((m) => ({ from: m.start + from, to: m.end + from }))
                    .filter((r) => r.from < r.to && r.to <= len);
                if (mode === "code") {
                    ranges = ranges.filter((r) =>
                        inCommentOrString(view, r.from),
                    );
                }
                view.dispatch({ effects: setSpellErrors.of(ranges) });
            }

            destroy() {
                clearTimeout(this.timer);
                this.seq++; // invalidate any in-flight run
                this.unsub();
            }
        },
    );
}

function spellContextMenu(
    onContext: (info: SpellContextInfo) => void,
): Extension {
    return EditorView.domEventHandlers({
        contextmenu(event, view) {
            const pos = view.posAtCoords({
                x: event.clientX,
                y: event.clientY,
            });
            if (pos == null) return false;
            const deco = view.state.field(spellField, false);
            if (!deco) return false;

            let hit: SpellRange | null = null;
            deco.between(pos, pos, (from, to) => {
                if (from <= pos && pos < to) {
                    hit = { from, to };
                    return false;
                }
            });
            if (!hit) return false;

            event.preventDefault();
            const { from, to } = hit;
            onContext({
                word: view.state.sliceDoc(from, to),
                from,
                to,
                x: event.clientX,
                y: event.clientY,
            });
            return true;
        },
    });
}

const spellTheme = EditorView.baseTheme({
    ".cm-spell-error": {
        textDecoration: "underline",
        textDecorationStyle: "wavy",
        textDecorationColor: "#ef4444",
        textDecorationSkipInk: "none",
        textUnderlineOffset: "2px",
    },
});

/**
 * Full spell-check extension for a CodeMirror editor: wavy underlines under
 * misspelled words plus a right-click hook that surfaces the offending word
 * so the host can show a suggestions menu.
 */
export function spellcheckExtension(
    mode: SpellMode,
    onContext: (info: SpellContextInfo) => void,
): Extension {
    return [
        spellField,
        spellChecker(mode),
        spellContextMenu(onContext),
        spellTheme,
    ];
}

/** Replace a misspelled range with a chosen suggestion. */
export function applySpellReplacement(
    view: EditorView,
    from: number,
    to: number,
    replacement: string,
): void {
    view.dispatch({
        changes: { from, to, insert: replacement },
        selection: { anchor: from + replacement.length },
    });
    view.focus();
}
