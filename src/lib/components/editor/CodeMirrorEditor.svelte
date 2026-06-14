<script lang="ts">
    import { onMount } from "svelte";
    import {
        EditorView,
        keymap,
        lineNumbers,
        highlightActiveLine,
        highlightActiveLineGutter,
        scrollPastEnd,
        drawSelection,
        Decoration,
        type DecorationSet,
        type KeyBinding,
    } from "@codemirror/view";
    import {
        EditorState,
        Compartment,
        Transaction,
        StateField,
        StateEffect,
        Prec,
        type Extension,
    } from "@codemirror/state";
    import {
        defaultKeymap,
        history,
        historyKeymap,
        indentWithTab,
        insertNewlineKeepIndent,
        toggleComment,
        toggleBlockComment,
        undoDepth,
        redoDepth,
    } from "@codemirror/commands";
    import { search, searchKeymap } from "@codemirror/search";
    import {
        syntaxHighlighting,
        HighlightStyle,
        StreamLanguage,
        bracketMatching,
        indentOnInput,
        indentUnit,
        codeFolding,
        foldGutter,
        foldKeymap,
        foldService,
        type StreamParser,
        type StringStream,
    } from "@codemirror/language";
    import { tags } from "@lezer/highlight";
    import { julia } from "@codemirror/legacy-modes/mode/julia";
    import {
        editorTheme,
        editorIndentSize,
        cmFontSize,
        codeMirrorViewInstance,
        codeMirrorCanUndo,
        codeMirrorCanRedo,
    } from "$lib/stores/editor.store";
    import { isPro } from "$lib/stores/auth.store";
    import AiSelectionToolbar from "$lib/components/shared/AiSelectionToolbar.svelte";
    import { invoke } from "@tauri-apps/api/core";
    import {
        gitDiffGutter,
        setGitBaseline,
    } from "$lib/codemirror/gitDiffGutter";
    import { latexInput } from "$lib/codemirror/latexInput";
    import { wrapSelection } from "$lib/codemirror/wrapSelection";
    import { readTextFile } from "@tauri-apps/plugin-fs";
    import { openOrFocusTab } from "$lib/stores/tabs.store";
    import { get } from "svelte/store";

    // ── Props ─────────────────────────────────────────────────────────────────

    let {
        value = "",
        language,
        extraKeymap = [],
        extensions: extraExtensions = [],
        class: className = "",
        lineWrap = true,
        aiSelectionTools = false,
        aiContextPrompt,
        askAiContextPrompt,
        filePath,
        scrollKey = null,
        onchange,
    }: {
        value?: string;
        language: "julia" | "typst" | "text";
        extraKeymap?: KeyBinding[];
        extensions?: Extension[];
        class?: string;
        lineWrap?: boolean;
        aiSelectionTools?: boolean;
        aiContextPrompt?: string;
        askAiContextPrompt?: string;
        filePath?: string | null;
        scrollKey?: string | null;
        onchange?: (newValue: string) => void;
    } = $props();

    type ScrollMap = Map<string, number>;
    const SCROLL_BY_KEY: ScrollMap = (() => {
        const g = globalThis as unknown as {
            __codeMirrorScrollByKey?: ScrollMap;
        };
        if (g.__codeMirrorScrollByKey instanceof Map)
            return g.__codeMirrorScrollByKey;
        const m: ScrollMap = new Map();
        g.__codeMirrorScrollByKey = m;
        return m;
    })();
    let lastScrollKey: string | null = null;
    let restoringScroll = false;
    let suppressOnChange = false;

    let aiSelection = $state<{
        from: number;
        to: number;
        text: string;
        x: number;
        y: number;
    } | null>(null);

    // ── Ayu Light theme ───────────────────────────────────────────────────────

    const ayuLightBase = EditorView.theme(
        {
            "&": {
                backgroundColor: "#fafafa",
                color: "#5c6773",
                height: "100%",
                "--cm-sel": "#bcd9f0",
            },
            ".cm-scroller": {
                overflow: "auto",
                fontFamily: "inherit",
                lineHeight: "1.6",
            },
            ".cm-content": {
                caretColor: "#ff9940",
                padding: "8px 0",
                paddingBottom: "1.5rem",
            },
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#ff9940", borderLeftWidth: "2px" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
                { background: "#bcd9f0" },
            ".cm-activeLine": { backgroundColor: "#f2f5f7" },
            ".cm-gutters": {
                backgroundColor: "#f3f4f5",
                color: "#aab0b6",
                border: "none",
                borderRight: "1px solid #e8eaed",
            },
            ".cm-activeLineGutter": { backgroundColor: "#edf1f5" },
            ".cm-lineNumbers .cm-gutterElement": {
                padding: "0 8px 0 12px",
                minWidth: "2.4em",
            },
            ".cm-matchingBracket": {
                backgroundColor: "#c3dcee",
                outline: "1px solid #399ee6",
            },
            // Autocomplete tooltip
            ".cm-tooltip": {
                backgroundColor: "#fff",
                border: "1px solid #e8eaed",
                borderRadius: "8px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                overflow: "hidden",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul": {
                maxHeight: "200px",
                fontFamily: "inherit",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
                padding: "3px 10px",
                lineHeight: "1.6",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
                backgroundColor: "#fff3e0",
                color: "#3d3d3d",
            },
            ".cm-completionLabel": { color: "#5c6773" },
            ".cm-completionDetail": {
                color: "#aab0b6",
                fontSize: "0.8em",
                marginLeft: "6px",
            },
            ".cm-completionMatchedText": {
                color: "#ff9940",
                fontWeight: "600",
                textDecoration: "none",
            },
            // Search panel
            ".cm-search": {
                padding: "4px 8px",
                background: "#f3f4f5",
                borderBottom: "1px solid #e8eaed",
                flexWrap: "wrap",
                gap: "4px",
            },
            ".cm-search input": {
                background: "#fff",
                border: "1px solid #e8eaed",
                borderRadius: "4px",
                padding: "2px 6px",
                color: "#5c6773",
                outline: "none",
            },
            ".cm-search input:focus": { borderColor: "#399ee6" },
            ".cm-search button": {
                background: "#e8eaed",
                border: "none",
                borderRadius: "4px",
                padding: "2px 8px",
                cursor: "pointer",
                color: "#5c6773",
            },
            ".cm-search button:hover": { background: "#d8dde3" },
            ".cm-search label": { color: "#5c6773", fontSize: "0.8em" },
            ".cm-searchMatch": {
                backgroundColor: "#c3dcee",
                outline: "1px solid #399ee6",
            },
            ".cm-searchMatch.cm-searchMatch-selected": {
                backgroundColor: "#ff994066",
            },
        },
        { dark: false },
    );

    const ayuLightHighlight = HighlightStyle.define([
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
        { tag: tags.heading, color: "#fa8d3e", fontWeight: "700" },
        {
            tag: tags.heading1,
            color: "#fa8d3e",
            fontWeight: "700",
            fontSize: "1.2em",
        },
        {
            tag: tags.heading2,
            color: "#f29e74",
            fontWeight: "700",
            fontSize: "1.1em",
        },
        { tag: tags.heading3, color: "#f29e74", fontWeight: "600" },
        { tag: tags.strong, fontWeight: "700" },
        { tag: tags.emphasis, fontStyle: "italic" },
        { tag: tags.link, color: "#399ee6", textDecoration: "underline" },
        { tag: tags.url, color: "#399ee6" },
        { tag: tags.meta, color: "#61aeee" },
        { tag: tags.processingInstruction, color: "#399ee6" },
        { tag: tags.content, color: "#5c6773" },
    ]);

    // ── Ayu Mirage theme ──────────────────────────────────────────────────────

    const ayuMirageBase = EditorView.theme(
        {
            "&": {
                backgroundColor: "#1f2430",
                color: "#cbccc6",
                height: "100%",
                "--cm-sel": "#3a4a66",
            },
            ".cm-scroller": {
                overflow: "auto",
                fontFamily: "inherit",
                lineHeight: "1.6",
            },
            ".cm-content": {
                caretColor: "#ffcc66",
                padding: "8px 0",
                paddingBottom: "1.5rem",
            },
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#ffcc66", borderLeftWidth: "2px" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
                { background: "#3a4a66" },
            ".cm-activeLine": { backgroundColor: "#232834" },
            ".cm-gutters": {
                backgroundColor: "#242936",
                color: "#707a8c",
                border: "none",
                borderRight: "1px solid #2d3343",
            },
            ".cm-activeLineGutter": { backgroundColor: "#232834" },
            ".cm-lineNumbers .cm-gutterElement": {
                padding: "0 8px 0 12px",
                minWidth: "2.4em",
            },
            ".cm-matchingBracket": {
                backgroundColor: "#2d4466",
                outline: "1px solid #5ccfe6",
            },
            // Autocomplete tooltip
            ".cm-tooltip": {
                backgroundColor: "#242936",
                border: "1px solid #2d3343",
                borderRadius: "8px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                overflow: "hidden",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul": {
                maxHeight: "200px",
                fontFamily: "inherit",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
                padding: "3px 10px",
                lineHeight: "1.6",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
                backgroundColor: "#2d3343",
                color: "#cbccc6",
            },
            ".cm-completionLabel": { color: "#cbccc6" },
            ".cm-completionDetail": {
                color: "#707a8c",
                fontSize: "0.8em",
                marginLeft: "6px",
            },
            ".cm-completionMatchedText": {
                color: "#ffcc66",
                fontWeight: "600",
                textDecoration: "none",
            },
            // Search panel
            ".cm-search": {
                padding: "4px 8px",
                background: "#242936",
                borderBottom: "1px solid #2d3343",
                flexWrap: "wrap",
                gap: "4px",
            },
            ".cm-search input": {
                background: "#1f2430",
                border: "1px solid #2d3343",
                borderRadius: "4px",
                padding: "2px 6px",
                color: "#cbccc6",
                outline: "none",
            },
            ".cm-search input:focus": { borderColor: "#5ccfe6" },
            ".cm-search button": {
                background: "#2d3343",
                border: "none",
                borderRadius: "4px",
                padding: "2px 8px",
                cursor: "pointer",
                color: "#cbccc6",
            },
            ".cm-search button:hover": { background: "#384050" },
            ".cm-search label": { color: "#cbccc6", fontSize: "0.8em" },
            ".cm-searchMatch": {
                backgroundColor: "#2d4466",
                outline: "1px solid #5ccfe6",
            },
            ".cm-searchMatch.cm-searchMatch-selected": {
                backgroundColor: "#ffcc6640",
            },
        },
        { dark: true },
    );

    const ayuMirageHighlight = HighlightStyle.define([
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
        { tag: tags.heading, color: "#ffa759", fontWeight: "700" },
        {
            tag: tags.heading1,
            color: "#ffa759",
            fontWeight: "700",
            fontSize: "1.2em",
        },
        {
            tag: tags.heading2,
            color: "#f29e74",
            fontWeight: "700",
            fontSize: "1.1em",
        },
        { tag: tags.heading3, color: "#f29e74", fontWeight: "600" },
        { tag: tags.strong, fontWeight: "700" },
        { tag: tags.emphasis, fontStyle: "italic" },
        { tag: tags.link, color: "#5ccfe6", textDecoration: "underline" },
        { tag: tags.url, color: "#5ccfe6" },
        { tag: tags.meta, color: "#5ccfe6" },
        { tag: tags.processingInstruction, color: "#5ccfe6" },
        { tag: tags.content, color: "#cbccc6" },
    ]);

    // ── Palette-driven themes (Gruvbox / Monokai) ─────────────────────────────

    interface ThemePalette {
        dark: boolean;
        bg: string;
        fg: string;
        caret: string;
        selection: string;
        activeLine: string;
        gutterBg: string;
        gutterFg: string;
        gutterBorder: string;
        activeGutterBg: string;
        tooltipBg: string;
        tooltipBorder: string;
        tooltipShadow: string;
        selMatchBg: string;
        matchBg: string;
        matchOutline: string;
        accent: string;
        comment: string;
        keyword: string;
        operator: string;
        string: string;
        special: string;
        number: string;
        type: string;
        func: string;
        variable: string;
        atom: string;
        attr: string;
        heading: string;
        link: string;
        meta: string;
        punctuation: string;
    }

    function makeBase(p: ThemePalette): Extension {
        return EditorView.theme(
            {
                "&": {
                    backgroundColor: p.bg,
                    color: p.fg,
                    height: "100%",
                    "--cm-sel": p.selection,
                },
                ".cm-scroller": {
                    overflow: "auto",
                    fontFamily: "inherit",
                    lineHeight: "1.6",
                },
                ".cm-content": {
                    caretColor: p.caret,
                    padding: "8px 0",
                    paddingBottom: "1.5rem",
                },
                ".cm-cursor, .cm-dropCursor": {
                    borderLeftColor: p.caret,
                    borderLeftWidth: "2px",
                },
                "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
                    { background: p.selection },
                ".cm-activeLine": { backgroundColor: p.activeLine },
                ".cm-gutters": {
                    backgroundColor: p.gutterBg,
                    color: p.gutterFg,
                    border: "none",
                    borderRight: `1px solid ${p.gutterBorder}`,
                },
                ".cm-activeLineGutter": { backgroundColor: p.activeGutterBg },
                ".cm-lineNumbers .cm-gutterElement": {
                    padding: "0 8px 0 12px",
                    minWidth: "2.4em",
                },
                ".cm-matchingBracket": {
                    backgroundColor: p.matchBg,
                    outline: `1px solid ${p.matchOutline}`,
                },
                ".cm-tooltip": {
                    backgroundColor: p.tooltipBg,
                    border: `1px solid ${p.tooltipBorder}`,
                    borderRadius: "8px",
                    boxShadow: p.tooltipShadow,
                    overflow: "hidden",
                },
                ".cm-tooltip.cm-tooltip-autocomplete > ul": {
                    maxHeight: "200px",
                    fontFamily: "inherit",
                },
                ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
                    padding: "3px 10px",
                    lineHeight: "1.6",
                },
                ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
                    backgroundColor: p.matchBg,
                    color: p.fg,
                },
                ".cm-completionLabel": { color: p.fg },
                ".cm-completionDetail": {
                    color: p.gutterFg,
                    fontSize: "0.8em",
                    marginLeft: "6px",
                },
                ".cm-completionMatchedText": {
                    color: p.accent,
                    fontWeight: "600",
                    textDecoration: "none",
                },
                ".cm-search": {
                    padding: "4px 8px",
                    background: p.gutterBg,
                    borderBottom: `1px solid ${p.gutterBorder}`,
                    flexWrap: "wrap",
                    gap: "4px",
                },
                ".cm-search input": {
                    background: p.bg,
                    border: `1px solid ${p.gutterBorder}`,
                    borderRadius: "4px",
                    padding: "2px 6px",
                    color: p.fg,
                    outline: "none",
                },
                ".cm-search input:focus": { borderColor: p.accent },
                ".cm-search button": {
                    background: p.matchBg,
                    border: "none",
                    borderRadius: "4px",
                    padding: "2px 8px",
                    cursor: "pointer",
                    color: p.fg,
                },
                ".cm-search label": { color: p.fg, fontSize: "0.8em" },
                ".cm-searchMatch": {
                    backgroundColor: p.matchBg,
                    outline: `1px solid ${p.matchOutline}`,
                },
                ".cm-searchMatch.cm-searchMatch-selected": {
                    backgroundColor: p.selMatchBg,
                },
            },
            { dark: p.dark },
        );
    }

    function makeHighlight(p: ThemePalette): HighlightStyle {
        return HighlightStyle.define([
            { tag: tags.comment, color: p.comment, fontStyle: "italic" },
            { tag: tags.keyword, color: p.keyword, fontWeight: "600" },
            { tag: tags.controlKeyword, color: p.keyword, fontWeight: "600" },
            {
                tag: tags.definitionKeyword,
                color: p.keyword,
                fontWeight: "600",
            },
            { tag: tags.moduleKeyword, color: p.keyword, fontWeight: "600" },
            { tag: tags.operator, color: p.operator },
            { tag: tags.operatorKeyword, color: p.operator },
            { tag: tags.string, color: p.string },
            { tag: tags.special(tags.string), color: p.special },
            { tag: tags.regexp, color: p.special },
            { tag: tags.escape, color: p.special },
            { tag: tags.number, color: p.number },
            { tag: tags.integer, color: p.number },
            { tag: tags.float, color: p.number },
            { tag: tags.bool, color: p.number },
            { tag: tags.null, color: p.number },
            { tag: tags.atom, color: p.atom },
            { tag: tags.typeName, color: p.type },
            { tag: tags.className, color: p.type },
            { tag: tags.function(tags.variableName), color: p.func },
            { tag: tags.definition(tags.variableName), color: p.func },
            { tag: tags.variableName, color: p.variable },
            { tag: tags.propertyName, color: p.variable },
            { tag: tags.attributeName, color: p.attr },
            { tag: tags.self, color: p.atom, fontStyle: "italic" },
            { tag: tags.punctuation, color: p.punctuation },
            { tag: tags.bracket, color: p.punctuation },
            { tag: tags.heading, color: p.heading, fontWeight: "700" },
            {
                tag: tags.heading1,
                color: p.heading,
                fontWeight: "700",
                fontSize: "1.2em",
            },
            {
                tag: tags.heading2,
                color: p.heading,
                fontWeight: "700",
                fontSize: "1.1em",
            },
            { tag: tags.heading3, color: p.heading, fontWeight: "600" },
            { tag: tags.strong, fontWeight: "700" },
            { tag: tags.emphasis, fontStyle: "italic" },
            { tag: tags.link, color: p.link, textDecoration: "underline" },
            { tag: tags.url, color: p.link },
            { tag: tags.meta, color: p.meta },
            { tag: tags.processingInstruction, color: p.meta },
            { tag: tags.content, color: p.fg },
        ]);
    }

    function makeTheme(p: ThemePalette): Extension[] {
        return [makeBase(p), syntaxHighlighting(makeHighlight(p))];
    }

    const gruvboxDark: ThemePalette = {
        dark: true,
        bg: "#282828", fg: "#ebdbb2", caret: "#fe8019", selection: "#504945",
        activeLine: "#32302f", gutterBg: "#1d2021", gutterFg: "#7c6f64",
        gutterBorder: "#3c3836", activeGutterBg: "#32302f",
        tooltipBg: "#3c3836", tooltipBorder: "#504945",
        tooltipShadow: "0 4px 16px rgba(0,0,0,0.4)",
        selMatchBg: "#fe801966", matchBg: "#504945", matchOutline: "#fabd2f",
        accent: "#fabd2f",
        comment: "#928374", keyword: "#fb4934", operator: "#fe8019",
        string: "#b8bb26", special: "#8ec07c", number: "#d3869b",
        type: "#fabd2f", func: "#8ec07c", variable: "#ebdbb2",
        atom: "#d3869b", attr: "#b8bb26", heading: "#fabd2f",
        link: "#83a598", meta: "#83a598", punctuation: "#a89984",
    };

    const gruvboxLight: ThemePalette = {
        dark: false,
        bg: "#fbf1c7", fg: "#3c3836", caret: "#af3a03", selection: "#ebdbb2",
        activeLine: "#f2e5bc", gutterBg: "#f2e5bc", gutterFg: "#bdae93",
        gutterBorder: "#ebdbb2", activeGutterBg: "#ebdbb2",
        tooltipBg: "#fbf1c7", tooltipBorder: "#d5c4a1",
        tooltipShadow: "0 4px 16px rgba(0,0,0,0.12)",
        selMatchBg: "#af3a0366", matchBg: "#d5c4a1", matchOutline: "#b57614",
        accent: "#b57614",
        comment: "#a89984", keyword: "#9d0006", operator: "#af3a03",
        string: "#79740e", special: "#427b58", number: "#8f3f71",
        type: "#b57614", func: "#427b58", variable: "#3c3836",
        atom: "#8f3f71", attr: "#79740e", heading: "#b57614",
        link: "#076678", meta: "#076678", punctuation: "#665c54",
    };

    const monokaiDark: ThemePalette = {
        dark: true,
        bg: "#272822", fg: "#f8f8f2", caret: "#f8f8f0", selection: "#49483e",
        activeLine: "#2f302a", gutterBg: "#272822", gutterFg: "#6e7066",
        gutterBorder: "#3a3b34", activeGutterBg: "#2f302a",
        tooltipBg: "#2f302a", tooltipBorder: "#49483e",
        tooltipShadow: "0 4px 16px rgba(0,0,0,0.4)",
        selMatchBg: "#fd971f66", matchBg: "#49483e", matchOutline: "#66d9ef",
        accent: "#e6db74",
        comment: "#75715e", keyword: "#f92672", operator: "#f92672",
        string: "#e6db74", special: "#a6e22e", number: "#ae81ff",
        type: "#66d9ef", func: "#a6e22e", variable: "#f8f8f2",
        atom: "#ae81ff", attr: "#a6e22e", heading: "#f92672",
        link: "#66d9ef", meta: "#66d9ef", punctuation: "#f8f8f2",
    };

    const monokaiLight: ThemePalette = {
        dark: false,
        bg: "#fafaf6", fg: "#4c4b3f", caret: "#e0185a", selection: "#e6e6dc",
        activeLine: "#f0f0e8", gutterBg: "#f0f0e8", gutterFg: "#b0afa0",
        gutterBorder: "#e6e6dc", activeGutterBg: "#e6e6dc",
        tooltipBg: "#ffffff", tooltipBorder: "#e0e0d6",
        tooltipShadow: "0 4px 16px rgba(0,0,0,0.12)",
        selMatchBg: "#e0185a40", matchBg: "#e6e6dc", matchOutline: "#1a9bb8",
        accent: "#c98a00",
        comment: "#a59f85", keyword: "#e0185a", operator: "#e0185a",
        string: "#8a7f00", special: "#5c8f00", number: "#7c5cd6",
        type: "#1a9bb8", func: "#5c8f00", variable: "#4c4b3f",
        atom: "#7c5cd6", attr: "#5c8f00", heading: "#e0185a",
        link: "#1a9bb8", meta: "#1a9bb8", punctuation: "#4c4b3f",
    };

    const solarizedDark: ThemePalette = {
        dark: true,
        bg: "#002b36", fg: "#839496", caret: "#839496", selection: "#073642",
        activeLine: "#073642", gutterBg: "#002b36", gutterFg: "#586e75",
        gutterBorder: "#073642", activeGutterBg: "#073642",
        tooltipBg: "#073642", tooltipBorder: "#586e75",
        tooltipShadow: "0 4px 16px rgba(0,0,0,0.4)",
        selMatchBg: "#cb4b1666", matchBg: "#073642", matchOutline: "#2aa198",
        accent: "#b58900",
        comment: "#586e75", keyword: "#859900", operator: "#cb4b16",
        string: "#2aa198", special: "#6c71c4", number: "#d33682",
        type: "#b58900", func: "#268bd2", variable: "#839496",
        atom: "#d33682", attr: "#859900", heading: "#cb4b16",
        link: "#268bd2", meta: "#6c71c4", punctuation: "#93a1a1",
    };

    const solarizedLight: ThemePalette = {
        dark: false,
        bg: "#fdf6e3", fg: "#657b83", caret: "#657b83", selection: "#eee8d5",
        activeLine: "#eee8d5", gutterBg: "#fdf6e3", gutterFg: "#93a1a1",
        gutterBorder: "#eee8d5", activeGutterBg: "#eee8d5",
        tooltipBg: "#fdf6e3", tooltipBorder: "#93a1a1",
        tooltipShadow: "0 4px 16px rgba(0,0,0,0.12)",
        selMatchBg: "#cb4b1640", matchBg: "#eee8d5", matchOutline: "#2aa198",
        accent: "#b58900",
        comment: "#93a1a1", keyword: "#859900", operator: "#cb4b16",
        string: "#2aa198", special: "#6c71c4", number: "#d33682",
        type: "#b58900", func: "#268bd2", variable: "#657b83",
        atom: "#d33682", attr: "#859900", heading: "#cb4b16",
        link: "#268bd2", meta: "#6c71c4", punctuation: "#586e75",
    };

    const tokyoNightDark: ThemePalette = {
        dark: true,
        bg: "#1a1b26", fg: "#c0caf5", caret: "#c0caf5", selection: "#283457",
        activeLine: "#1e202e", gutterBg: "#1a1b26", gutterFg: "#3b4261",
        gutterBorder: "#1e202e", activeGutterBg: "#1e202e",
        tooltipBg: "#1f2335", tooltipBorder: "#3b4261",
        tooltipShadow: "0 4px 16px rgba(0,0,0,0.5)",
        selMatchBg: "#ff9e6466", matchBg: "#283457", matchOutline: "#2ac3de",
        accent: "#7aa2f7",
        comment: "#565f89", keyword: "#bb9af7", operator: "#89ddff",
        string: "#9ece6a", special: "#e0af68", number: "#ff9e64",
        type: "#2ac3de", func: "#7aa2f7", variable: "#c0caf5",
        atom: "#ff9e64", attr: "#73daca", heading: "#bb9af7",
        link: "#7aa2f7", meta: "#7dcfff", punctuation: "#9aa5ce",
    };

    const tokyoNightLight: ThemePalette = {
        dark: false,
        bg: "#e1e2e7", fg: "#3760bf", caret: "#3760bf", selection: "#b6bfe2",
        activeLine: "#d7d9e3", gutterBg: "#e1e2e7", gutterFg: "#a1a6c5",
        gutterBorder: "#d7d9e3", activeGutterBg: "#d7d9e3",
        tooltipBg: "#e9e9ed", tooltipBorder: "#a1a6c5",
        tooltipShadow: "0 4px 16px rgba(0,0,0,0.12)",
        selMatchBg: "#b15c0040", matchBg: "#c4c8da", matchOutline: "#007197",
        accent: "#2e7de9",
        comment: "#848cb5", keyword: "#9854f1", operator: "#006a83",
        string: "#587539", special: "#b15c00", number: "#b15c00",
        type: "#007197", func: "#2e7de9", variable: "#3760bf",
        atom: "#b15c00", attr: "#7847bd", heading: "#9854f1",
        link: "#2e7de9", meta: "#007197", punctuation: "#3760bf",
    };

    // ── Typst StreamParser ────────────────────────────────────────────────────

    type TypstState = {
        blockComment: number;
        inString: boolean;
        inMath: boolean;
    };

    const typstLanguage = StreamLanguage.define<TypstState>({
        name: "typst",
        startState: () => ({ blockComment: 0, inString: false, inMath: false }),
        copyState: (s) => ({ ...s }),
        // Custom token style for function calls (`#align(`, `text(`).
        tokenTable: {
            typstFunction: tags.function(tags.variableName),
        },

        token(stream, state) {
            // Inside a block comment
            if (state.blockComment > 0) {
                if (stream.match("/*")) {
                    state.blockComment++;
                    return "comment";
                }
                if (stream.match("*/")) {
                    state.blockComment--;
                    return "comment";
                }
                stream.next();
                return "comment";
            }

            // Inside a string
            if (state.inString) {
                while (!stream.eol()) {
                    const ch = stream.next();
                    if (ch === "\\") {
                        stream.next();
                        continue;
                    }
                    if (ch === '"') {
                        state.inString = false;
                        break;
                    }
                }
                return "string";
            }

            // Inside math $...$
            if (state.inMath) {
                if (stream.match("$")) {
                    state.inMath = false;
                    return "atom";
                }
                stream.next();
                return "atom";
            }

            // Line comment
            if (stream.match("//")) {
                stream.skipToEnd();
                return "comment";
            }

            // Block comment
            if (stream.match("/*")) {
                state.blockComment = 1;
                return "comment";
            }

            // String literal
            if (stream.match('"')) {
                state.inString = true;
                while (!stream.eol()) {
                    const ch = stream.next();
                    if (ch === "\\") {
                        stream.next();
                        continue;
                    }
                    if (ch === '"') {
                        state.inString = false;
                        break;
                    }
                }
                return "string";
            }

            // Math mode  $...$
            if (stream.match("$")) {
                state.inMath = true;
                return "atom";
            }

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
                    "let",
                    "set",
                    "show",
                    "import",
                    "include",
                    "if",
                    "else",
                    "for",
                    "while",
                    "return",
                    "break",
                    "continue",
                    "not",
                    "and",
                    "or",
                    "true",
                    "false",
                    "none",
                    "auto",
                    "context",
                ];
                if (keywords.includes(word)) return "keyword";
                // `#align(…)`, `#emph[…]` — a hash name applied to args or a
                // content block is a function call.
                const next = stream.peek();
                if (next === "(" || next === "[") return "typstFunction";
                return "variableName";
            }

            // Numbers with optional units
            if (
                stream.match(
                    /^[0-9]+(\.[0-9]*)?(em|pt|mm|cm|in|%|fr|deg|rad|px)?/,
                )
            ) {
                return "number";
            }

            // Bare identifiers in code position. Typst has no mode tracking
            // here, so only function calls are styled; named arguments like
            // `size:` stay at the editor body color.
            if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_-]*/)) {
                const next = stream.peek();
                if (next === "(") return "typstFunction";
                return null;
            }

            stream.next();
            return null;
        },

        blankLine(_state) {
            /* nothing */
        },
    });

    // ── Theme / language helpers ───────────────────────────────────────────────

    const themeExtensions: Record<string, Extension[]> = {
        "ayu-light": [ayuLightBase, syntaxHighlighting(ayuLightHighlight)],
        "ayu-mirage": [ayuMirageBase, syntaxHighlighting(ayuMirageHighlight)],
        "gruvbox-light": makeTheme(gruvboxLight),
        "gruvbox-dark": makeTheme(gruvboxDark),
        "monokai-light": makeTheme(monokaiLight),
        "monokai-dark": makeTheme(monokaiDark),
        "solarized-light": makeTheme(solarizedLight),
        "solarized-dark": makeTheme(solarizedDark),
        "tokyo-night-light": makeTheme(tokyoNightLight),
        "tokyo-night-dark": makeTheme(tokyoNightDark),
    };

    function getThemeExt(theme: string): Extension[] {
        return themeExtensions[theme] ?? themeExtensions["ayu-light"];
    }

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
            // The legacy mode's annotation tokenizer emits a separate
            // `builtin` token per `{...}` nesting level, so a parametric
            // type like `::Vector{String}` arrives as several fragments.
            // Capture the nesting depth *before* tokenizing to recognise
            // those continuation fragments.
            const prevNested =
                (state as { nestedParameters?: number }).nestedParameters ?? 0;
            const style = julia.token ? julia.token(stream, state) : null;
            if (style === "variable" || style === "builtin") {
                // Strip a leading `::` so type annotations (`s::Ar`) are
                // detected from the type name itself.
                let probe = stream.current();
                if (style === "builtin" && probe.startsWith(":")) {
                    return "juliaSymbol";
                }
                const isAnnotation = probe.startsWith("::");
                if (isAnnotation) probe = probe.slice(2);
                // Every fragment of a type annotation — the leading
                // `::Name`, nested `{`, inner type names, commas and the
                // closing `}` — is re-tagged `type` so the whole
                // annotation is highlighted uniformly.
                if (style === "builtin" && (isAnnotation || prevNested > 0)) {
                    return "type";
                }
                if (/^[A-Z]/.test(probe) && !NON_TYPE_BUILTINS.has(probe)) {
                    return "type";
                }
                // Lowercase name directly followed by `(` → function call.
                if (style === "variable" && stream.peek() === "(") {
                    return "functionCall";
                }
            }
            return style;
        },
    };
    const juliaLanguage = StreamLanguage.define(juliaTypeAware);
    const juliaCommentData = juliaLanguage.data.of({
        commentTokens: { line: "#", block: { open: "#=", close: "=#" } },
    });
    const typstCommentData = typstLanguage.data.of({
        commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
    });

    function getLangExt(lang: string): Extension {
        if (lang === "julia") return [juliaLanguage, juliaCommentData];
        if (lang === "typst") return [typstLanguage, typstCommentData];
        return [];
    }

    // ── Code folding ──────────────────────────────────────────────────────────
    // The editor uses StreamLanguage modes (Julia / Typst) which don't expose a
    // syntax tree for the default syntax-based folding, so fold ranges are
    // derived from indentation: a line folds everything below it that is more
    // deeply indented (bridging blank lines), VS Code–style.
    function leadingIndent(text: string): number {
        let i = 0;
        while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
        return i;
    }

    const indentFoldService = foldService.of((state, lineStart) => {
        const line = state.doc.lineAt(lineStart);
        if (line.text.trim() === "") return null;
        const baseIndent = leadingIndent(line.text);
        let end = line.to;
        let foundDeeper = false;
        for (let n = line.number + 1; n <= state.doc.lines; n++) {
            const nl = state.doc.line(n);
            if (nl.text.trim() === "") continue; // bridge blank lines
            if (leadingIndent(nl.text) > baseIndent) {
                end = nl.to;
                foundDeeper = true;
            } else {
                break;
            }
        }
        return foundDeeper ? { from: line.to, to: end } : null;
    });

    // Caret markers: a downward chevron when expanded, right-pointing when
    // collapsed. The SVG strokes inherit the gutter's themed text color.
    function foldMarkerDOM(open: boolean): HTMLElement {
        const el = document.createElement("span");
        el.className =
            "cm-foldCaret " + (open ? "cm-foldCaret-open" : "cm-foldCaret-closed");
        el.setAttribute("aria-hidden", "true");
        el.innerHTML = open
            ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        return el;
    }

    const foldStyleTheme = EditorView.baseTheme({
        ".cm-foldGutter": { width: "14px" },
        ".cm-foldGutter .cm-gutterElement": {
            padding: "0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
        },
        ".cm-foldCaret": {
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "opacity 0.15s ease",
        },
        // Expand carets stay hidden until the gutter is hovered (VS Code-style);
        // collapsed carets are always visible so folded code is discoverable.
        ".cm-foldCaret-open": { opacity: "0" },
        ".cm-foldCaret-closed": { opacity: "0.85" },
        ".cm-gutters:hover .cm-foldCaret-open": { opacity: "0.55" },
        ".cm-gutters:hover .cm-foldCaret-open:hover, .cm-gutters:hover .cm-foldCaret-closed:hover":
            { opacity: "1" },
    });

    const foldingExtension: Extension = [
        codeFolding(),
        indentFoldService,
        foldGutter({ markerDOM: foldMarkerDOM }),
        foldStyleTheme,
    ];

    // ── Editor setup ──────────────────────────────────────────────────────────

    const themeComp = new Compartment();
    const langComp = new Compartment();
    const wrapComp = new Compartment();
    const indentComp = new Compartment();

    let container: HTMLDivElement;
    let view: EditorView;

    function saveScroll(key: string | null = lastScrollKey): void {
        if (!key || !view || restoringScroll) return;
        // Svelte 5 detaches the DOM before effect teardown runs, and a
        // detached scrollDOM reads scrollTop 0 — saving then would clobber
        // the offset captured by the scroll listener while the view was live.
        if (!view.scrollDOM.isConnected) return;
        SCROLL_BY_KEY.set(key, view.scrollDOM.scrollTop);
    }

    function restoreScroll(key: string): void {
        if (!view) return;
        const target = SCROLL_BY_KEY.get(key);
        if (target === undefined) return;

        restoringScroll = true;
        let attempts = 0;
        let stableFrames = 0;
        const MAX_ATTEMPTS = 30;
        const apply = () => {
            if (!view || lastScrollKey !== key) {
                restoringScroll = false;
                return;
            }
            view.scrollDOM.scrollTop = target;
            const drift = Math.abs(view.scrollDOM.scrollTop - target);
            stableFrames = drift <= 1 ? stableFrames + 1 : 0;
            attempts += 1;
            if (stableFrames < 2 && attempts < MAX_ATTEMPTS) {
                requestAnimationFrame(apply);
            } else {
                requestAnimationFrame(() => {
                    restoringScroll = false;
                });
            }
        };

        requestAnimationFrame(apply);
    }

    function updateAiSelection() {
        if (!aiSelectionTools || !view || !$isPro) {
            aiSelection = null;
            return;
        }

        const selection = view.state.selection.main;
        if (selection.empty) {
            aiSelection = null;
            return;
        }

        const from = Math.min(selection.from, selection.to);
        const to = Math.max(selection.from, selection.to);
        const text = view.state.sliceDoc(from, to);
        if (!text.trim()) {
            aiSelection = null;
            return;
        }

        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);
        if (!start && !end) {
            aiSelection = null;
            return;
        }

        const left = start?.left ?? end!.left;
        const right = end?.right ?? start!.right;
        const top = Math.min(start?.top ?? end!.top, end?.top ?? start!.top);
        const viewportWidth = window.innerWidth || 0;
        aiSelection = {
            from,
            to,
            text,
            x: Math.max(180, Math.min(viewportWidth - 180, (left + right) / 2)),
            y: Math.max(12, top - 8),
        };
    }

    function replaceAiSelection(replacement: string) {
        if (!view || !aiSelection) return;
        const from = Math.min(aiSelection.from, view.state.doc.length);
        const to = Math.min(aiSelection.to, view.state.doc.length);
        view.dispatch({
            changes: { from, to, insert: replacement },
            selection: { anchor: from + replacement.length },
            scrollIntoView: true,
        });
        view.focus();
        aiSelection = null;
    }

    // ── Julia "go to definition" (Ctrl/Cmd + hover & click) ───────────────────

    const JULIA_KEYWORDS = new Set([
        "function", "end", "if", "else", "elseif", "while", "for", "begin",
        "let", "do", "try", "catch", "finally", "return", "break", "continue",
        "module", "baremodule", "using", "import", "export", "const", "local",
        "global", "struct", "mutable", "abstract", "primitive", "type", "quote",
        "macro", "where", "in", "isa", "true", "false", "nothing", "missing",
    ]);

    type WordRange = { from: number; to: number; word: string };

    // Extract the Julia identifier under a document position, with its range.
    function wordRangeAt(
        doc: EditorState["doc"],
        pos: number,
    ): WordRange | null {
        const line = doc.lineAt(pos);
        const text = line.text;
        const col = pos - line.from;
        const isWord = (c: string) => /[A-Za-z0-9_!]/.test(c);
        let start = col;
        let end = col;
        while (start > 0 && isWord(text[start - 1])) start--;
        while (end < text.length && isWord(text[end])) end++;
        if (start === end) return null;
        const word = text.slice(start, end);
        // Identifiers can't start with a digit, and keywords aren't navigable.
        if (/^[0-9]/.test(word) || JULIA_KEYWORDS.has(word)) return null;
        return { from: line.from + start, to: line.from + end, word };
    }

    // Search the current document for a Julia definition of `name`; returns the
    // character offset of the name in its definition, or null if not found.
    function findJuliaDefinition(
        doc: EditorState["doc"],
        name: string,
    ): number | null {
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const patterns = [
            // function name(...)  /  function Mod.name(...)
            new RegExp(`\\bfunction\\s+(?:[\\w.]+\\.)?${esc}\\b`),
            // macro name(...)
            new RegExp(`\\bmacro\\s+${esc}\\b`),
            // short form:  name(...) = ...
            new RegExp(`^\\s*(?:[\\w.]+\\.)?${esc}\\s*\\(`),
            // assignment / const:  name = ...  /  const name = ...
            new RegExp(`^\\s*(?:const\\s+)?${esc}\\s*=`),
        ];
        for (const re of patterns) {
            for (let i = 1; i <= doc.lines; i++) {
                const line = doc.line(i);
                if (re.test(line.text)) {
                    const idx = line.text.indexOf(name);
                    return line.from + (idx >= 0 ? idx : 0);
                }
            }
        }
        return null;
    }

    // Resolve a symbol's definition through the running Julia REPL — this
    // covers library/module functions (e.g. `mean` from Statistics) by asking
    // Julia where its methods are defined, then opening that source file.
    async function resolveExternalDefinition(name: string) {
        let locs: string[];
        try {
            locs = await invoke<string[]>("julia_definition", {
                symbol: name,
            });
        } catch {
            return; // REPL not running, or symbol unknown — nothing to do.
        }
        // Each entry is "file:line"; pick the first real source file.
        const loc = locs.find(
            (l) => l.lastIndexOf(":") > 0 && !l.startsWith("none"),
        );
        if (!loc) return;
        const sep = loc.lastIndexOf(":");
        const file = loc.slice(0, sep);
        const line = parseInt(loc.slice(sep + 1), 10) || 1;
        try {
            const content = await readTextFile(file);
            openOrFocusTab(file, content);
        } catch {
            return; // File not readable (e.g. baked into a sysimage).
        }
        // Wait for the editor to remount on the newly-opened tab, then jump.
        setTimeout(() => {
            const v = get(codeMirrorViewInstance);
            if (!v || line > v.state.doc.lines) return;
            const docLine = v.state.doc.line(line);
            v.dispatch({
                selection: { anchor: docLine.from, head: docLine.to },
                effects: EditorView.scrollIntoView(docLine.from, {
                    y: "center",
                }),
            });
            v.focus();
        }, 220);
    }

    // Ctrl/Cmd-hover underline: a state field holding a single mark decoration
    // over the identifier currently under the cursor while the modifier is held.
    const setDefLink = StateEffect.define<WordRange | null>();
    const defLinkMark = Decoration.mark({ class: "cm-defLink" });

    const defLinkField = StateField.define<DecorationSet>({
        create: () => Decoration.none,
        update(deco, tr) {
            deco = deco.map(tr.changes);
            for (const e of tr.effects) {
                if (e.is(setDefLink)) {
                    deco = e.value
                        ? Decoration.set([
                              defLinkMark.range(e.value.from, e.value.to),
                          ])
                        : Decoration.none;
                }
            }
            return deco;
        },
        provide: (f) => EditorView.decorations.from(f),
    });

    let lastMouse = { x: 0, y: 0 };

    // Show / hide the hover underline based on cursor position + modifier state.
    function updateDefLink(editorView: EditorView, modActive: boolean) {
        const current = editorView.state.field(defLinkField, false);
        const hasMark = !!current && current.size > 0;
        const pos = modActive ? editorView.posAtCoords(lastMouse) : null;
        const range =
            pos == null ? null : wordRangeAt(editorView.state.doc, pos);
        if (!range) {
            if (hasMark) editorView.dispatch({ effects: setDefLink.of(null) });
            return;
        }
        // Skip a redundant dispatch when the marked range is unchanged.
        let same = false;
        current?.between(range.from, range.to, (f, t) => {
            if (f === range.from && t === range.to) same = true;
        });
        if (same) return;
        editorView.dispatch({ effects: setDefLink.of(range) });
    }

    const juliaGoToDefinition = EditorView.domEventHandlers({
        mousedown(event, editorView) {
            if (!(event.metaKey || event.ctrlKey) || event.button !== 0) {
                return false;
            }
            const pos = editorView.posAtCoords({
                x: event.clientX,
                y: event.clientY,
            });
            if (pos == null) return false;
            const range = wordRangeAt(editorView.state.doc, pos);
            if (!range) return false;
            event.preventDefault();
            editorView.dispatch({ effects: setDefLink.of(null) });
            // Prefer a definition in the current file; fall back to the REPL
            // for symbols defined in libraries / other modules.
            const local = findJuliaDefinition(editorView.state.doc, range.word);
            if (local != null) {
                editorView.dispatch({
                    selection: {
                        anchor: local,
                        head: local + range.word.length,
                    },
                    scrollIntoView: true,
                });
                editorView.focus();
            } else {
                resolveExternalDefinition(range.word);
            }
            return true;
        },
        mousemove(event, editorView) {
            lastMouse = { x: event.clientX, y: event.clientY };
            updateDefLink(editorView, event.metaKey || event.ctrlKey);
            return false;
        },
        mouseleave(_event, editorView) {
            updateDefLink(editorView, false);
            return false;
        },
        keydown(event, editorView) {
            if (event.key === "Meta" || event.key === "Control") {
                updateDefLink(editorView, true);
            }
            return false;
        },
        keyup(event, editorView) {
            if (event.key === "Meta" || event.key === "Control") {
                updateDefLink(editorView, false);
            }
            return false;
        },
    });

    onMount(() => {
        const state = EditorState.create({
            doc: value,
            extensions: [
                lineNumbers(),
                // Fold gutter is registered after lineNumbers (and at default
                // precedence) so it sits to the right of the line numbers.
                foldingExtension,
                drawSelection(),
                highlightActiveLine(),
                highlightActiveLineGutter(),
                history(),
                bracketMatching(),
                indentOnInput(),
                indentComp.of(indentUnit.of(" ".repeat($editorIndentSize))),
                wrapComp.of(lineWrap ? EditorView.lineWrapping : []),
                scrollPastEnd(),
                search({ top: true }),
                // Typing a quote over a selection wraps it instead of replacing.
                wrapSelection,
                // Julia-style `\latex`+Tab → Unicode (e.g. \sigma → σ).
                ...(language === "julia" ? [latexInput] : []),
                keymap.of([
                    ...extraKeymap,
                    {
                        key: "Enter",
                        run: insertNewlineKeepIndent,
                        preventDefault: true,
                    },
                    { key: "Mod-/", run: toggleComment, preventDefault: true },
                    {
                        key: "Shift-Alt-a",
                        run: toggleBlockComment,
                        preventDefault: true,
                    },
                    indentWithTab,
                    ...historyKeymap,
                    ...searchKeymap,
                    ...foldKeymap,
                    ...defaultKeymap,
                ]),
                themeComp.of(getThemeExt($editorTheme)),
                langComp.of(getLangExt(language)),
                ...(language === "julia"
                    ? [juliaGoToDefinition, defLinkField]
                    : []),
                // Higher precedence than the line-number gutter so the diff
                // bars render at the very left edge, before the line numbers.
                Prec.high(gitDiffGutter()),
                ...extraExtensions,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && !suppressOnChange) {
                        onchange?.(update.state.doc.toString());
                    }
                    if (
                        update.selectionSet ||
                        update.docChanged ||
                        update.focusChanged
                    ) {
                        updateAiSelection();
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
        lastScrollKey = scrollKey;

        const onScroll = () => saveScroll();
        view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });

        if (scrollKey) {
            restoreScroll(scrollKey);
        }

        return () => {
            saveScroll();
            view.scrollDOM.removeEventListener("scroll", onScroll);
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
            suppressOnChange = true;
            try {
                view.dispatch({
                    changes: { from: 0, to: currentDoc.length, insert: newValue },
                    selection: {
                        anchor: Math.min(main.anchor, len),
                        head: Math.min(main.head, len),
                    },
                    annotations: Transaction.addToHistory.of(false),
                });
            } finally {
                suppressOnChange = false;
            }
        }
    });

    $effect(() => {
        if (!view) return;
        const nextKey = scrollKey;
        if (lastScrollKey !== null && lastScrollKey !== nextKey) {
            saveScroll(lastScrollKey);
        }
        lastScrollKey = nextKey;
        if (nextKey) {
            restoreScroll(nextKey);
        }
    });

    // Sync theme changes
    $effect(() => {
        const theme = $editorTheme;
        if (!view) return;
        view.dispatch({ effects: themeComp.reconfigure(getThemeExt(theme)) });
    });

    // Sync line-wrap changes
    $effect(() => {
        if (!view) return;
        view.dispatch({
            effects: wrapComp.reconfigure(
                lineWrap ? EditorView.lineWrapping : [],
            ),
        });
    });

    // Sync indent-size changes
    $effect(() => {
        const size = $editorIndentSize;
        if (!view) return;
        view.dispatch({
            effects: indentComp.reconfigure(
                indentUnit.of(" ".repeat(size)),
            ),
        });
    });

    // Remeasure layout after font-size change so line numbers stay aligned
    $effect(() => {
        $cmFontSize; // reactive dependency
        if (view) requestAnimationFrame(() => view.requestMeasure());
    });

    // Fetch git HEAD baseline for the current file and feed it into the diff gutter.
    // null baseline disables the gutter (untracked file or not inside a git repo).
    $effect(() => {
        const path = filePath ?? null;
        if (!view) return;
        let cancelled = false;
        if (!path) {
            view.dispatch({ effects: setGitBaseline.of(null) });
            return;
        }
        // Clear the previous file's baseline immediately so the gutter never
        // diffs this file's content against the wrong (stale) HEAD while the new
        // baseline is being fetched.
        view.dispatch({ effects: setGitBaseline.of(null) });
        invoke<string | null>("git_head_content", { filePath: path })
            .then((baseline) => {
                if (cancelled || !view) return;
                view.dispatch({ effects: setGitBaseline.of(baseline ?? null) });
            })
            .catch(() => {
                if (cancelled || !view) return;
                view.dispatch({ effects: setGitBaseline.of(null) });
            });
        return () => {
            cancelled = true;
        };
    });
</script>

<div
    bind:this={container}
    class={className}
    style="--cm-font-size: {$cmFontSize}px"
></div>

{#if aiSelectionTools && $isPro && aiSelection}
    <AiSelectionToolbar
        selectedText={aiSelection.text}
        x={aiSelection.x}
        y={aiSelection.y}
        contextPrompt={aiContextPrompt}
        askAiContextPrompt={askAiContextPrompt}
        {language}
        onReplace={replaceAiSelection}
        onClose={() => (aiSelection = null)}
    />
{/if}

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
    /* Two layers paint the selection so it works in all cases:
       1) drawSelection()'s .cm-selectionBackground gives the continuous
          full-line-height block that fills gaps between wrapped/multi-line
          rows (VSCode-style).
       2) Native ::selection paints the glyph background on top — this is
          what makes partial selections still visible on the active line,
          whose opaque background otherwise covers the layer in (1). */
    div :global(.cm-selectionBackground),
    div :global(.cm-selectionLayer .cm-selectionBackground),
    div :global(.cm-focused .cm-selectionBackground),
    div :global(.cm-focused .cm-selectionLayer .cm-selectionBackground) {
        background: var(--cm-sel, #c3dcee) !important;
        border-radius: 2px;
    }
    div :global(.cm-content ::selection),
    div :global(.cm-content::selection) {
        background: var(--cm-sel, #c3dcee);
    }
    div :global(.cm-activeLine) {
        background-color: #f2f5f7 !important;
    }
    div :global(.cm-activeLine.cm-line) {
        background-color: transparent !important;
    }
    /* Zero out .cm-content's default horizontal padding so the active-line
       background reaches the editor edges, then re-add the horizontal
       padding on .cm-line itself so the *text* still has breathing room. */
    div :global(.cm-content) {
        padding-left: 0 !important;
        padding-right: 0 !important;
    }
    div :global(.cm-line) {
        padding-left: 12px;
        padding-right: 12px;
    }
    div :global(.cm-activeLine .cm-selectionBackground),
    div :global(.cm-activeLine .cm-selectionLayer .cm-selectionBackground) {
        background: var(--cm-sel, #c3dcee) !important;
    }
    /* Ctrl/Cmd-hover go-to-definition hint — underline + pointer cursor,
       mirroring the VSCode / Zed affordance. */
    div :global(.cm-defLink) {
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: pointer;
    }
</style>
