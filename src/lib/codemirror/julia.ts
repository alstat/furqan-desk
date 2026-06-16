/**
 * Shared Julia language support for CodeMirror.
 *
 * Wraps the legacy Julia stream mode with a type-aware tokenizer and exposes
 * Ayu-flavoured light/dark highlight styles, so both the file editor
 * (CodeMirrorEditor.svelte) and the editor's Julia code cells render Julia
 * with identical highlighting.
 */
import {
    HighlightStyle,
    StreamLanguage,
    type StreamParser,
    type StringStream,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { julia } from "@codemirror/legacy-modes/mode/julia";

// The legacy Julia mode tags every identifier as plain `variable` (or
// `builtin` for `::Type` annotations), so type names and function calls
// never reach their highlight rules. Wrap the tokenizer to re-tag tokens:
//  • An identifier starting with an uppercase letter is, by Julia
//    convention, a type or constructor → `type` (→ typeName).
//  • A lowercase identifier immediately followed by `(` is a function
//    call → custom `functionCall` token (→ function(variableName)).
//  • A Julia symbol token like `:code` is re-tagged as `atom`. The legacy
//    mode only emits this when `:` starts a new expression, so ranges like
//    `1:end` remain plain operators/keywords rather than symbols.
// `NaN`/`Inf` are uppercase value literals and are kept as-is.
const NON_TYPE_BUILTINS = new Set(["NaN", "Inf"]);

const juliaTypeAware: StreamParser<unknown> = {
    ...julia,
    tokenTable: {
        functionCall: tags.function(tags.variableName),
        juliaSymbol: tags.atom,
    },
    token(stream: StringStream, state: unknown): string | null {
        // The legacy mode's annotation tokenizer emits a separate `builtin`
        // token per `{...}` nesting level, so a parametric type like
        // `::Vector{String}` arrives as several fragments. Capture the
        // nesting depth *before* tokenizing to recognise continuations.
        const prevNested =
            (state as { nestedParameters?: number }).nestedParameters ?? 0;
        const style = julia.token ? julia.token(stream, state) : null;
        if (style === "variable" || style === "builtin") {
            let probe = stream.current();
            // A leading `:` marks a Julia symbol (`:code`), but a type
            // annotation's first fragment also starts with `::` — exclude it
            // so the annotation reaches the `type` rule below instead of being
            // mis-tagged as a symbol.
            if (
                style === "builtin" &&
                probe.startsWith(":") &&
                !probe.startsWith("::")
            ) {
                return "juliaSymbol";
            }
            const isAnnotation = probe.startsWith("::");
            if (isAnnotation) probe = probe.slice(2);
            if (style === "builtin" && (isAnnotation || prevNested > 0)) {
                return "type";
            }
            if (/^[A-Z]/.test(probe) && !NON_TYPE_BUILTINS.has(probe)) {
                return "type";
            }
            if (style === "variable" && stream.peek() === "(") {
                return "functionCall";
            }
        }
        return style;
    },
};

export const juliaLanguage = StreamLanguage.define(juliaTypeAware);

export const juliaCommentData = juliaLanguage.data.of({
    commentTokens: { line: "#", block: { open: "#=", close: "=#" } },
});

/** Julia language extension bundle (language + comment metadata). */
export const juliaSupport = [juliaLanguage, juliaCommentData];

/** Ayu Light syntax colours. */
export const juliaLightHighlight = HighlightStyle.define([
    { tag: tags.comment, color: "#abb0b6", fontStyle: "italic" },
    { tag: tags.keyword, color: "#fa8d3e", fontWeight: "600" },
    { tag: tags.controlKeyword, color: "#fa8d3e", fontWeight: "600" },
    { tag: tags.definitionKeyword, color: "#fa8d3e", fontWeight: "600" },
    { tag: tags.moduleKeyword, color: "#fa8d3e", fontWeight: "600" },
    { tag: tags.operator, color: "#ed9366" },
    { tag: tags.operatorKeyword, color: "#ed9366" },
    { tag: tags.string, color: "#86b300" },
    { tag: tags.special(tags.string), color: "#4cbf99" },
    { tag: tags.regexp, color: "#4cbf99" },
    { tag: tags.escape, color: "#4cbf99" },
    { tag: tags.number, color: "#a37acc" },
    { tag: tags.integer, color: "#a37acc" },
    { tag: tags.float, color: "#a37acc" },
    { tag: tags.bool, color: "#a37acc" },
    { tag: tags.null, color: "#a37acc" },
    { tag: tags.atom, color: "#f07171" },
    { tag: tags.typeName, color: "#399ee6" },
    { tag: tags.className, color: "#399ee6" },
    { tag: tags.function(tags.variableName), color: "#f07171" },
    { tag: tags.definition(tags.variableName), color: "#41a6d9" },
    { tag: tags.variableName, color: "#5c6773" },
    { tag: tags.propertyName, color: "#5c6773" },
    { tag: tags.attributeName, color: "#f07171" },
    { tag: tags.self, color: "#f07171", fontStyle: "italic" },
    { tag: tags.punctuation, color: "#575f66" },
    { tag: tags.bracket, color: "#575f66" },
    { tag: tags.meta, color: "#61aeee" },
]);

/** Ayu Mirage (dark) syntax colours. */
export const juliaDarkHighlight = HighlightStyle.define([
    { tag: tags.comment, color: "#5c6773", fontStyle: "italic" },
    { tag: tags.keyword, color: "#ffa759", fontWeight: "600" },
    { tag: tags.controlKeyword, color: "#ffa759", fontWeight: "600" },
    { tag: tags.definitionKeyword, color: "#ffa759", fontWeight: "600" },
    { tag: tags.moduleKeyword, color: "#ffa759", fontWeight: "600" },
    { tag: tags.operator, color: "#f29e74" },
    { tag: tags.operatorKeyword, color: "#f29e74" },
    { tag: tags.string, color: "#bae67e" },
    { tag: tags.special(tags.string), color: "#95e6cb" },
    { tag: tags.regexp, color: "#95e6cb" },
    { tag: tags.escape, color: "#95e6cb" },
    { tag: tags.number, color: "#ffcc66" },
    { tag: tags.integer, color: "#ffcc66" },
    { tag: tags.float, color: "#ffcc66" },
    { tag: tags.bool, color: "#ffcc66" },
    { tag: tags.null, color: "#ffcc66" },
    { tag: tags.atom, color: "#ffd580" },
    { tag: tags.typeName, color: "#5ccfe6" },
    { tag: tags.className, color: "#5ccfe6" },
    { tag: tags.function(tags.variableName), color: "#ffd580" },
    { tag: tags.definition(tags.variableName), color: "#73d0ff" },
    { tag: tags.variableName, color: "#cbccc6" },
    { tag: tags.propertyName, color: "#cbccc6" },
    { tag: tags.attributeName, color: "#ffd580" },
    { tag: tags.self, color: "#ffd580", fontStyle: "italic" },
    { tag: tags.punctuation, color: "#cbccc6" },
    { tag: tags.bracket, color: "#cbccc6" },
    { tag: tags.meta, color: "#5ccfe6" },
]);
