<script lang="ts">
    import { onMount } from 'svelte';
    import {
        EditorView,
        keymap,
        lineNumbers,
        highlightActiveLine,
        highlightActiveLineGutter,
        scrollPastEnd,
        type KeyBinding,
    } from '@codemirror/view';
    import { EditorState, Compartment, Transaction, type Extension } from '@codemirror/state';
    import {
        defaultKeymap,
        history,
        historyKeymap,
        indentWithTab,
        undoDepth,
        redoDepth,
    } from '@codemirror/commands';
    import {
        syntaxHighlighting,
        HighlightStyle,
        StreamLanguage,
        bracketMatching,
        indentOnInput,
    } from '@codemirror/language';
    import { tags } from '@lezer/highlight';
    import { julia } from '@codemirror/legacy-modes/mode/julia';
    import { editorTheme, cmFontSize, codeMirrorViewInstance, codeMirrorCanUndo, codeMirrorCanRedo } from '$lib/stores/editor.store';

    // ── Props ─────────────────────────────────────────────────────────────────

    let {
        value = '',
        language,
        extraKeymap = [],
        extensions: extraExtensions = [],
        class: className = '',
        onchange,
    }: {
        value?: string;
        language: 'julia' | 'typst' | 'text';
        extraKeymap?: KeyBinding[];
        extensions?: Extension[];
        class?: string;
        onchange?: (newValue: string) => void;
    } = $props();

    // ── Ayu Light theme ───────────────────────────────────────────────────────

    const ayuLightBase = EditorView.theme({
        '&': { backgroundColor: '#fafafa', color: '#5c6773', height: '100%', '--cm-sel': '#c3dcee' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit', lineHeight: '1.6' },
        '.cm-content': { caretColor: '#ff9940', padding: '8px 0', paddingBottom: '1.5rem' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#ff9940' },
        '.cm-activeLine': { backgroundColor: '#f2f5f7' },
        '.cm-gutters': {
            backgroundColor: '#f3f4f5',
            color: '#aab0b6',
            border: 'none',
            borderRight: '1px solid #e8eaed',
        },
        '.cm-activeLineGutter': { backgroundColor: '#edf1f5' },
        '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px', minWidth: '2.4em' },
        '.cm-matchingBracket': { backgroundColor: '#c3dcee', outline: '1px solid #399ee6' },
        // Autocomplete tooltip
        '.cm-tooltip': { backgroundColor: '#fff', border: '1px solid #e8eaed', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden' },
        '.cm-tooltip.cm-tooltip-autocomplete > ul': { maxHeight: '200px', fontFamily: 'inherit' },
        '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px', lineHeight: '1.6' },
        '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#fff3e0', color: '#3d3d3d' },
        '.cm-completionLabel': { color: '#5c6773' },
        '.cm-completionDetail': { color: '#aab0b6', fontSize: '0.8em', marginLeft: '6px' },
        '.cm-completionMatchedText': { color: '#ff9940', fontWeight: '600', textDecoration: 'none' },
    }, { dark: false });

    const ayuLightHighlight = HighlightStyle.define([
        { tag: tags.comment,                          color: '#abb0b6', fontStyle: 'italic' },
        { tag: tags.keyword,                          color: '#fa8d3e', fontWeight: '600' },
        { tag: tags.controlKeyword,                   color: '#fa8d3e', fontWeight: '600' },
        { tag: tags.definitionKeyword,                color: '#fa8d3e', fontWeight: '600' },
        { tag: tags.moduleKeyword,                    color: '#fa8d3e', fontWeight: '600' },
        { tag: tags.operator,                         color: '#ed9366' },
        { tag: tags.operatorKeyword,                  color: '#ed9366' },
        { tag: tags.string,                           color: '#86b300' },
        { tag: tags.special(tags.string),             color: '#4cbf99' },
        { tag: tags.regexp,                           color: '#4cbf99' },
        { tag: tags.escape,                           color: '#4cbf99' },
        { tag: tags.number,                           color: '#a37acc' },
        { tag: tags.integer,                          color: '#a37acc' },
        { tag: tags.float,                            color: '#a37acc' },
        { tag: tags.bool,                             color: '#a37acc' },
        { tag: tags.null,                             color: '#a37acc' },
        { tag: tags.atom,                             color: '#f07171' },
        { tag: tags.typeName,                         color: '#399ee6' },
        { tag: tags.className,                        color: '#399ee6' },
        { tag: tags.function(tags.variableName),      color: '#f07171' },
        { tag: tags.definition(tags.variableName),    color: '#41a6d9' },
        { tag: tags.variableName,                     color: '#5c6773' },
        { tag: tags.propertyName,                     color: '#5c6773' },
        { tag: tags.attributeName,                    color: '#f07171' },
        { tag: tags.self,                             color: '#f07171', fontStyle: 'italic' },
        { tag: tags.punctuation,                      color: '#575f66' },
        { tag: tags.bracket,                          color: '#575f66' },
        { tag: tags.heading,                          color: '#fa8d3e', fontWeight: '700' },
        { tag: tags.heading1,                         color: '#fa8d3e', fontWeight: '700', fontSize: '1.2em' },
        { tag: tags.heading2,                         color: '#f29e74', fontWeight: '700', fontSize: '1.1em' },
        { tag: tags.heading3,                         color: '#f29e74', fontWeight: '600' },
        { tag: tags.strong,                           fontWeight: '700' },
        { tag: tags.emphasis,                         fontStyle: 'italic' },
        { tag: tags.link,                             color: '#399ee6', textDecoration: 'underline' },
        { tag: tags.url,                              color: '#399ee6' },
        { tag: tags.meta,                             color: '#61aeee' },
        { tag: tags.processingInstruction,            color: '#399ee6' },
        { tag: tags.content,                          color: '#5c6773' },
    ]);

    // ── Ayu Mirage theme ──────────────────────────────────────────────────────

    const ayuMirageBase = EditorView.theme({
        '&': { backgroundColor: '#1f2430', color: '#cbccc6', height: '100%', '--cm-sel': '#3a6ea8' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit', lineHeight: '1.6' },
        '.cm-content': { caretColor: '#ffcc66', padding: '8px 0', paddingBottom: '1.5rem' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#ffcc66' },
        '.cm-activeLine': { backgroundColor: '#232834' },
        '.cm-gutters': {
            backgroundColor: '#242936',
            color: '#707a8c',
            border: 'none',
            borderRight: '1px solid #2d3343',
        },
        '.cm-activeLineGutter': { backgroundColor: '#232834' },
        '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px', minWidth: '2.4em' },
        '.cm-matchingBracket': { backgroundColor: '#2d4466', outline: '1px solid #5ccfe6' },
        // Autocomplete tooltip
        '.cm-tooltip': { backgroundColor: '#242936', border: '1px solid #2d3343', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', overflow: 'hidden' },
        '.cm-tooltip.cm-tooltip-autocomplete > ul': { maxHeight: '200px', fontFamily: 'inherit' },
        '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px', lineHeight: '1.6' },
        '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#2d3343', color: '#cbccc6' },
        '.cm-completionLabel': { color: '#cbccc6' },
        '.cm-completionDetail': { color: '#707a8c', fontSize: '0.8em', marginLeft: '6px' },
        '.cm-completionMatchedText': { color: '#ffcc66', fontWeight: '600', textDecoration: 'none' },
    }, { dark: true });

    const ayuMirageHighlight = HighlightStyle.define([
        { tag: tags.comment,                          color: '#5c6773', fontStyle: 'italic' },
        { tag: tags.keyword,                          color: '#ffa759', fontWeight: '600' },
        { tag: tags.controlKeyword,                   color: '#ffa759', fontWeight: '600' },
        { tag: tags.definitionKeyword,                color: '#ffa759', fontWeight: '600' },
        { tag: tags.moduleKeyword,                    color: '#ffa759', fontWeight: '600' },
        { tag: tags.operator,                         color: '#f29e74' },
        { tag: tags.operatorKeyword,                  color: '#f29e74' },
        { tag: tags.string,                           color: '#bae67e' },
        { tag: tags.special(tags.string),             color: '#95e6cb' },
        { tag: tags.regexp,                           color: '#95e6cb' },
        { tag: tags.escape,                           color: '#95e6cb' },
        { tag: tags.number,                           color: '#ffcc66' },
        { tag: tags.integer,                          color: '#ffcc66' },
        { tag: tags.float,                            color: '#ffcc66' },
        { tag: tags.bool,                             color: '#ffcc66' },
        { tag: tags.null,                             color: '#ffcc66' },
        { tag: tags.atom,                             color: '#ffd580' },
        { tag: tags.typeName,                         color: '#5ccfe6' },
        { tag: tags.className,                        color: '#5ccfe6' },
        { tag: tags.function(tags.variableName),      color: '#ffd580' },
        { tag: tags.definition(tags.variableName),    color: '#73d0ff' },
        { tag: tags.variableName,                     color: '#cbccc6' },
        { tag: tags.propertyName,                     color: '#cbccc6' },
        { tag: tags.attributeName,                    color: '#ffd580' },
        { tag: tags.self,                             color: '#ffd580', fontStyle: 'italic' },
        { tag: tags.punctuation,                      color: '#cbccc6' },
        { tag: tags.bracket,                          color: '#cbccc6' },
        { tag: tags.heading,                          color: '#ffa759', fontWeight: '700' },
        { tag: tags.heading1,                         color: '#ffa759', fontWeight: '700', fontSize: '1.2em' },
        { tag: tags.heading2,                         color: '#f29e74', fontWeight: '700', fontSize: '1.1em' },
        { tag: tags.heading3,                         color: '#f29e74', fontWeight: '600' },
        { tag: tags.strong,                           fontWeight: '700' },
        { tag: tags.emphasis,                         fontStyle: 'italic' },
        { tag: tags.link,                             color: '#5ccfe6', textDecoration: 'underline' },
        { tag: tags.url,                              color: '#5ccfe6' },
        { tag: tags.meta,                             color: '#5ccfe6' },
        { tag: tags.processingInstruction,            color: '#5ccfe6' },
        { tag: tags.content,                          color: '#cbccc6' },
    ]);

    // ── Typst StreamParser ────────────────────────────────────────────────────

    type TypstState = { blockComment: number; inString: boolean; inMath: boolean };

    const typstLanguage = StreamLanguage.define<TypstState>({
        name: 'typst',
        startState: () => ({ blockComment: 0, inString: false, inMath: false }),
        copyState: (s) => ({ ...s }),

        token(stream, state) {
            // Inside a block comment
            if (state.blockComment > 0) {
                if (stream.match('/*')) { state.blockComment++; return 'comment'; }
                if (stream.match('*/')) { state.blockComment--; return 'comment'; }
                stream.next();
                return 'comment';
            }

            // Inside a string
            if (state.inString) {
                while (!stream.eol()) {
                    const ch = stream.next();
                    if (ch === '\\') { stream.next(); continue; }
                    if (ch === '"') { state.inString = false; break; }
                }
                return 'string';
            }

            // Inside math $...$
            if (state.inMath) {
                if (stream.match('$')) { state.inMath = false; return 'atom'; }
                stream.next();
                return 'atom';
            }

            // Line comment
            if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }

            // Block comment
            if (stream.match('/*')) { state.blockComment = 1; return 'comment'; }

            // String literal
            if (stream.match('"')) {
                state.inString = true;
                while (!stream.eol()) {
                    const ch = stream.next();
                    if (ch === '\\') { stream.next(); continue; }
                    if (ch === '"') { state.inString = false; break; }
                }
                return 'string';
            }

            // Math mode  $...$
            if (stream.match('$')) { state.inMath = true; return 'atom'; }

            // Headings: = Title, == Section, === Subsection (must be at line start)
            if (stream.sol() && stream.match(/^={1,6} /)) {
                const level = Math.min(stream.current().trim().length, 6);
                stream.skipToEnd();
                return `heading${level}`;
            }

            // Hash functions / keywords: #funcname, #let, #set, ...
            if (stream.match(/^#[a-zA-Z_][a-zA-Z0-9_-]*/)) {
                const word = stream.current().slice(1);
                const keywords = [
                    'let', 'set', 'show', 'import', 'include',
                    'if', 'else', 'for', 'while', 'return',
                    'break', 'continue', 'not', 'and', 'or',
                    'true', 'false', 'none', 'auto', 'context',
                ];
                return keywords.includes(word) ? 'keyword' : 'variableName';
            }

            // Numbers with optional units
            if (stream.match(/^[0-9]+(\.[0-9]*)?(em|pt|mm|cm|in|%|fr|deg|rad|px)?/)) {
                return 'number';
            }

            stream.next();
            return null;
        },

        blankLine(_state) { /* nothing */ },
    });

    // ── Theme / language helpers ───────────────────────────────────────────────

    function getThemeExt(theme: string): Extension[] {
        if (theme === 'ayu-mirage') {
            return [ayuMirageBase, syntaxHighlighting(ayuMirageHighlight)];
        }
        return [ayuLightBase, syntaxHighlighting(ayuLightHighlight)];
    }

    function getLangExt(lang: string): Extension {
        if (lang === 'julia') return StreamLanguage.define(julia);
        if (lang === 'typst') return typstLanguage;
        return [];
    }

    // ── Editor setup ──────────────────────────────────────────────────────────

    const themeComp = new Compartment();
    const langComp  = new Compartment();

    let container: HTMLDivElement;
    let view: EditorView;

    onMount(() => {
        const state = EditorState.create({
            doc: value,
            extensions: [
                lineNumbers(),
                highlightActiveLine(),
                highlightActiveLineGutter(),
                history(),
                bracketMatching(),
                indentOnInput(),
                EditorView.lineWrapping,
                scrollPastEnd(),
                keymap.of([
                    ...extraKeymap,
                    indentWithTab,
                    ...historyKeymap,
                    ...defaultKeymap,
                ]),
                themeComp.of(getThemeExt($editorTheme)),
                langComp.of(getLangExt(language)),
                ...extraExtensions,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        onchange?.(update.state.doc.toString());
                    }
                    codeMirrorCanUndo.set(undoDepth(update.state) > 0);
                    codeMirrorCanRedo.set(redoDepth(update.state) > 0);
                }),
            ],
        });

        view = new EditorView({ state, parent: container });
        codeMirrorViewInstance.set(view);
        codeMirrorCanUndo.set(false);
        codeMirrorCanRedo.set(false);

        return () => {
            codeMirrorViewInstance.set(null);
            codeMirrorCanUndo.set(false);
            codeMirrorCanRedo.set(false);
            view.destroy();
        };
    });

    // Sync external value changes (e.g. tab switch)
    // addToHistory:false prevents these programmatic replaces from entering CM's own history.
    // We preserve the current selection so the caret doesn't jump on reactive re-renders.
    $effect(() => {
        if (!view) return;
        const newValue = value;
        const currentDoc = view.state.doc.toString();
        if (newValue !== currentDoc) {
            const { main } = view.state.selection;
            const len = newValue.length;
            view.dispatch({
                changes: { from: 0, to: currentDoc.length, insert: newValue },
                selection: { anchor: Math.min(main.anchor, len), head: Math.min(main.head, len) },
                annotations: Transaction.addToHistory.of(false),
            });
        }
    });

    // Sync theme changes
    $effect(() => {
        const theme = $editorTheme;
        if (!view) return;
        view.dispatch({ effects: themeComp.reconfigure(getThemeExt(theme)) });
    });

    // Remeasure layout after font-size change so line numbers stay aligned
    $effect(() => {
        $cmFontSize; // reactive dependency
        if (view) requestAnimationFrame(() => view.requestMeasure());
    });
</script>

<div bind:this={container} class={className} style="--cm-font-size: {$cmFontSize}px"></div>

<style>
    div :global(.cm-editor) {
        height: 100%;
        border-radius: inherit;
        font-size: var(--cm-font-size, 0.875rem);
    }
    div :global(.cm-scroller) {
        border-radius: inherit;
    }
    div :global(.cm-focused) {
        outline: none;
    }
    /* Native browser selection — character-accurate, works on any sub-word range */
    div :global(.cm-content *::selection),
    div :global(.cm-content::selection) {
        background-color: var(--cm-sel, #c3dcee);
    }
</style>
