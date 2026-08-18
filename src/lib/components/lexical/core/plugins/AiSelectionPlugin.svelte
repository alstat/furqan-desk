<script lang="ts">
    import { onMount } from "svelte";
    import {
        $createParagraphNode as createParagraphNode,
        $createRangeSelection as createRangeSelection,
        $createTextNode as createTextNode,
        $getSelection as getSelection,
        $insertNodes as insertNodes,
        $isElementNode as isElementNode,
        $isRangeSelection as isRangeSelection,
        $setSelection as setSelection,
        type ElementNode,
        type LexicalNode,
    } from "lexical";
    import { $findMatchingParent as findMatchingParent } from "@lexical/utils";
    import {
        $createHeadingNode as createHeadingNode,
        $createQuoteNode as createQuoteNode,
        $isHeadingNode as isHeadingNode,
        $isQuoteNode as isQuoteNode,
    } from "@lexical/rich-text";
    import { getEditor } from "$lexical/core/composerContext.js";
    import { getStyleProperty, setStyleProperty } from "$lexical/core/blockStyle";
    import { isPro } from "$lib/stores/auth.store";
    import AiSelectionToolbar from "$lib/components/shared/AiSelectionToolbar.svelte";

    const editor = getEditor();

    let aiSelection = $state<{
        text: string;
        x: number;
        y: number;
        range: Range;
    } | null>(null);

    function toolbarHasFocus() {
        const active = document.activeElement;
        return (
            active instanceof HTMLElement &&
            active.closest("[data-ai-selection-toolbar]") !== null
        );
    }

    function readSelection() {
        if (!$isPro) {
            aiSelection = null;
            return;
        }

        if (aiSelection && toolbarHasFocus()) return;

        let text = "";
        editor.getEditorState().read(() => {
            const selection = getSelection();
            if (isRangeSelection(selection) && !selection.isCollapsed()) {
                text = selection.getTextContent();
            }
        });

        if (!text.trim()) {
            aiSelection = null;
            return;
        }

        const domSelection = window.getSelection();
        const root = editor.getRootElement();
        if (!domSelection || domSelection.rangeCount === 0 || !root) {
            aiSelection = null;
            return;
        }

        const anchor = domSelection.anchorNode;
        if (anchor && !root.contains(anchor)) {
            aiSelection = null;
            return;
        }

        const range = domSelection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            aiSelection = null;
            return;
        }

        aiSelection = {
            text,
            x: Math.max(180, Math.min(window.innerWidth - 180, rect.left + rect.width / 2)),
            y: Math.max(12, rect.top - 8),
            range: range.cloneRange(),
        };
    }

    /** The block (paragraph, heading, list item…) a node's text lives in. */
    function blockOf(node: LexicalNode): ElementNode | null {
        if (isElementNode(node) && !node.isInline()) return node;
        return (
            findMatchingParent(
                node,
                (parent): parent is ElementNode =>
                    isElementNode(parent) && !parent.isInline(),
            ) ?? null
        );
    }

    /**
     * A paragraph carrying one line of the reply. Alignment and the block's
     * line spacing come from the block the selection started in so the new
     * paragraphs sit consistently with the surrounding text; the rest of that
     * block's styling (a heading's own type and look) is deliberately not
     * copied — only the first line inherits it, by being merged into it.
     */
    function paragraphFor(text: string, source: ElementNode | null) {
        const paragraph = createParagraphNode();
        if (source) {
            paragraph.setFormat(source.getFormatType());
            const lineHeight = getStyleProperty(
                source.getStyle(),
                "line-height",
            );
            if (lineHeight) {
                paragraph.setStyle(
                    setStyleProperty("", "line-height", lineHeight),
                );
            }
        }
        paragraph.append(createTextNode(text));
        return paragraph;
    }

    /**
     * The block for the reply's first line. It keeps the kind of block the
     * selection started in, so rewriting a whole heading gives a heading back:
     * Lexical's own insert drops a block it has fully emptied unless the
     * incoming one merges into it, which would silently demote the heading to
     * body text.
     */
    function leadBlockFor(text: string, source: ElementNode | null) {
        let block: ElementNode;
        if (isHeadingNode(source)) block = createHeadingNode(source.getTag());
        else if (isQuoteNode(source)) block = createQuoteNode();
        else return paragraphFor(text, source);

        block.setFormat(source.getFormatType());
        block.setStyle(source.getStyle());
        block.append(createTextNode(text));
        return block;
    }

    function replaceSelection(replacement: string) {
        const captured = aiSelection;
        if (!captured) return;

        // One block per non-blank line: models separate paragraphs with blank
        // lines, and list-like replies with single ones.
        const lines = replacement
            .split(/\r?\n/)
            .filter((line) => line.trim().length > 0);

        editor.update(() => {
            const rangeSelection = createRangeSelection();
            rangeSelection.applyDOMRange(captured.range);
            setSelection(rangeSelection);

            const selection = getSelection();
            if (!isRangeSelection(selection)) return;

            if (lines.length <= 1) {
                // Single paragraph — plain text insertion, which keeps the
                // inline formatting of the text it replaces.
                selection.insertText(lines[0] ?? replacement);
                return;
            }

            // A multi-paragraph reply has to arrive as multiple blocks. As one
            // string it collapsed into the block holding the start of the
            // selection, so a reply that began inside a Heading 1 became a
            // single Heading 1 — and every later attempt to restyle part of it
            // restyled the whole answer. $insertNodes merges the first
            // paragraph into that block and lays the rest out as siblings, so
            // each line stays independently formattable.
            const start = selection.isBackward()
                ? selection.focus
                : selection.anchor;
            const startBlock = blockOf(start.getNode());
            insertNodes(
                lines.map((line, index) =>
                    index === 0
                        ? leadBlockFor(line, startBlock)
                        : paragraphFor(line, startBlock),
                ),
            );
        });

        editor.focus();
        aiSelection = null;
    }

    onMount(() => {
        const unregister = editor.registerUpdateListener(() => {
            requestAnimationFrame(readSelection);
        });
        document.addEventListener("selectionchange", readSelection);

        return () => {
            unregister();
            document.removeEventListener("selectionchange", readSelection);
        };
    });
</script>

{#if $isPro && aiSelection}
    <AiSelectionToolbar
        selectedText={aiSelection.text}
        x={aiSelection.x}
        y={aiSelection.y}
        onReplace={replaceSelection}
        onClose={() => (aiSelection = null)}
    />
{/if}
