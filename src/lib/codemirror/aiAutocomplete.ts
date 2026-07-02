import {
    EditorView,
    Decoration,
    type DecorationSet,
    WidgetType,
    ViewPlugin,
    type ViewUpdate,
    keymap,
} from "@codemirror/view";
import { StateField, StateEffect, Prec, type Extension } from "@codemirror/state";
import {
    aiAutocompleteActive,
    fetchAiCompletion,
} from "$lib/stores/ai-autocomplete.store";

// Inline "ghost text" AI autocompletion for CodeMirror editors (Typst editor).
// After a short typing pause it asks the chat-completion function for a
// continuation and renders it dimmed at the caret; Tab accepts, Escape (or
// any cursor move / edit that diverges from it) dismisses. Typing the first
// characters of the suggestion consumes it instead of dropping it.

type Suggestion = { pos: number; text: string };

const setSuggestion = StateEffect.define<Suggestion | null>();

class GhostWidget extends WidgetType {
    constructor(readonly text: string) {
        super();
    }
    override eq(other: GhostWidget) {
        return other.text === this.text;
    }
    toDOM() {
        const span = document.createElement("span");
        span.className = "cm-ai-ghost";
        span.textContent = this.text;
        return span;
    }
}

const suggestionField = StateField.define<Suggestion | null>({
    create: () => null,
    update(value, tr) {
        for (const e of tr.effects) {
            if (e.is(setSuggestion)) return e.value;
        }
        if (!value) return null;
        if (tr.docChanged) {
            // "Type-through": a plain insertion at the caret that matches the
            // head of the suggestion consumes it; anything else clears it.
            let next: Suggestion | null = null;
            let changes = 0;
            tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
                changes++;
                const ins = inserted.toString();
                if (
                    changes === 1 &&
                    fromA === toA &&
                    fromA === value.pos &&
                    ins.length > 0 &&
                    value.text.startsWith(ins) &&
                    ins.length < value.text.length
                ) {
                    next = { pos: value.pos + ins.length, text: value.text.slice(ins.length) };
                }
            });
            return changes === 1 ? next : null;
        }
        if (tr.selection && tr.selection.main.head !== value.pos) return null;
        return value;
    },
    provide: (f) =>
        EditorView.decorations.from(f, (v): DecorationSet => {
            if (!v || !v.text) return Decoration.none;
            return Decoration.set([
                Decoration.widget({ widget: new GhostWidget(v.text), side: 1 }).range(v.pos),
            ]);
        }),
});

const DEBOUNCE_MS = 300;
const MIN_PREFIX = 20;
const PREFIX_CHARS = 2000;
const SUFFIX_CHARS = 500;

function fetchPlugin(language: string) {
    return ViewPlugin.fromClass(
        class {
            timer: ReturnType<typeof setTimeout> | null = null;
            controller: AbortController | null = null;

            constructor(readonly view: EditorView) {}

            update(update: ViewUpdate) {
                if (update.focusChanged && !update.view.hasFocus) {
                    this.cancel();
                    if (update.state.field(suggestionField)) {
                        queueMicrotask(() =>
                            this.view.dispatch({ effects: setSuggestion.of(null) }),
                        );
                    }
                    return;
                }
                // Re-plan a fetch after the user edits or moves the caret, but
                // not for our own setSuggestion dispatches.
                const external = update.transactions.some(
                    (tr) =>
                        !tr.effects.some((e) => e.is(setSuggestion)) &&
                        (tr.docChanged || tr.selection),
                );
                if (external) this.schedule();
            }

            schedule() {
                this.cancel();
                if (!aiAutocompleteActive()) return;
                this.timer = setTimeout(() => this.run(), DEBOUNCE_MS);
            }

            cancel() {
                if (this.timer) clearTimeout(this.timer);
                this.timer = null;
                this.controller?.abort();
                this.controller = null;
            }

            async run() {
                const view = this.view;
                if (!aiAutocompleteActive() || !view.hasFocus || view.composing) return;
                if (view.state.field(suggestionField)) return; // already showing one

                const { main } = view.state.selection;
                if (!main.empty) return;
                const head = main.head;
                const line = view.state.doc.lineAt(head);
                // Only suggest at a line end (ignoring trailing whitespace) —
                // mid-line ghost text is more noise than help.
                if (view.state.sliceDoc(head, line.to).trim() !== "") return;

                const prefix = view.state.sliceDoc(
                    Math.max(0, head - PREFIX_CHARS),
                    head,
                );
                if (prefix.trim().length < MIN_PREFIX) return;
                const suffix = view.state.sliceDoc(
                    head,
                    Math.min(view.state.doc.length, head + SUFFIX_CHARS),
                );

                const controller = new AbortController();
                this.controller = controller;
                const docLength = view.state.doc.length;
                // Stream the ghost text in as it arrives instead of waiting
                // for the full completion — first tokens show almost
                // immediately. Any doc/caret change aborts mid-stream.
                const emit = (text: string) => {
                    if (
                        view.state.doc.length !== docLength ||
                        view.state.selection.main.head !== head ||
                        !view.hasFocus
                    ) {
                        controller.abort();
                        return;
                    }
                    view.dispatch({ effects: setSuggestion.of({ pos: head, text }) });
                };
                const text = await fetchAiCompletion({
                    prefix,
                    suffix,
                    language,
                    signal: controller.signal,
                    onPartial: emit,
                });
                // Final text can differ from the last partial (trailing
                // whitespace trimmed); reconcile unless it became stale.
                if (
                    !text ||
                    controller.signal.aborted ||
                    view.state.doc.length !== docLength ||
                    view.state.selection.main.head !== head ||
                    !view.hasFocus
                ) {
                    return;
                }
                view.dispatch({ effects: setSuggestion.of({ pos: head, text }) });
            }

            destroy() {
                this.cancel();
            }
        },
    );
}

const acceptOrDismissKeymap = Prec.highest(
    keymap.of([
        {
            key: "Tab",
            run: (view) => {
                const s = view.state.field(suggestionField, false);
                if (!s || !s.text) return false;
                view.dispatch({
                    changes: { from: s.pos, insert: s.text },
                    selection: { anchor: s.pos + s.text.length },
                    effects: setSuggestion.of(null),
                    userEvent: "input.complete",
                });
                return true;
            },
        },
        {
            key: "Escape",
            run: (view) => {
                const s = view.state.field(suggestionField, false);
                if (!s) return false;
                view.dispatch({ effects: setSuggestion.of(null) });
                return true;
            },
        },
    ]),
);

const ghostTheme = EditorView.baseTheme({
    ".cm-ai-ghost": {
        opacity: "0.5",
        whiteSpace: "pre-wrap",
    },
});

/** Inline AI ghost-text autocompletion (Pro-gated via the settings store). */
export function aiAutocomplete(language: string): Extension {
    return [suggestionField, fetchPlugin(language), acceptOrDismissKeymap, ghostTheme];
}
