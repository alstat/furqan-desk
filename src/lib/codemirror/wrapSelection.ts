/**
 * Wrap-selection-with-quotes for CodeMirror.
 *
 * When one or more non-empty selections exist and the user types `"`, `'` or
 * a backtick, the selected text is wrapped in that quote pair instead of being
 * replaced. With no selection the key behaves normally (inserts the char).
 *
 * Shared by the file editor (CodeMirrorEditor.svelte) and the notebook's Julia
 * code cells (JuliaCellComponent.svelte).
 */
import { EditorView } from "@codemirror/view";
import { EditorSelection, type Extension } from "@codemirror/state";

// Opening char → closing char. Quotes are symmetric; the map also leaves room
// for asymmetric pairs should they ever be added.
const WRAP_PAIRS: Record<string, string> = {
    '"': '"',
    "'": "'",
    "`": "`",
};

/** CodeMirror extension: typing a quote over a selection wraps it. */
export const wrapSelection: Extension = EditorView.inputHandler.of(
    (view, _from, _to, text) => {
        const close = WRAP_PAIRS[text];
        if (!close) return false;
        const { state } = view;
        // Defer to normal insertion when nothing is selected.
        if (state.selection.ranges.every((r) => r.empty)) return false;
        const tr = state.changeByRange((range) => {
            if (range.empty) return { range, changes: [] };
            return {
                changes: [
                    { from: range.from, insert: text },
                    { from: range.to, insert: close },
                ],
                // Keep the original text selected, shifted past the open quote.
                range: EditorSelection.range(
                    range.from + text.length,
                    range.to + text.length,
                ),
            };
        });
        view.dispatch(
            state.update(tr, {
                userEvent: "input.type",
                scrollIntoView: true,
            }),
        );
        return true;
    },
);
