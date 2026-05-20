<script module lang="ts">
    import { COMMAND_PRIORITY_EDITOR, createCommand, type LexicalCommand } from "lexical";

    export const INSERT_JULIA_CELL_COMMAND: LexicalCommand<void> = createCommand(
        "INSERT_JULIA_CELL_COMMAND",
    );
</script>

<script lang="ts">
    import { getEditor } from "$lexical/core/composerContext.js";
    import { onMount } from "svelte";
    import {
        $createParagraphNode as createParagraphNode,
        $getSelection as getSelection,
        $isElementNode as isElementNode,
        $isNodeSelection as isNodeSelection,
        $isRangeSelection as isRangeSelection,
        $isTextNode as isTextNode,
        COMMAND_PRIORITY_HIGH,
        KEY_ARROW_DOWN_COMMAND,
        KEY_ARROW_UP_COMMAND,
        type LexicalNode,
        type RangeSelection,
    } from "lexical";
    import { $insertNodeToNearestRoot as insertNodeToNearestRoot } from "@lexical/utils";
    import {
        $createJuliaCellNode as createJuliaCellNode,
        $isJuliaCellNode as isJuliaCellNode,
    } from "./JuliaCellNode";

    const editor = getEditor();

    let { children }: { children?: import("svelte").Snippet } = $props();

    // True when the collapsed range selection sits at the very start/end of
    // its top-level block — i.e. the next arrow press would otherwise cross
    // the block boundary. Used to skip a Julia cell that sits adjacent to the
    // user's current block, so the caret hops over the cell instead of
    // selecting it.
    function isAtTopBlockEdge(
        selection: RangeSelection,
        edge: "start" | "end",
    ): boolean {
        const focusNode = selection.focus.getNode();
        const top = focusNode.getTopLevelElement();
        if (!top) return false;
        let target: LexicalNode = top;
        while (isElementNode(target) && target.getChildrenSize() > 0) {
            target =
                edge === "end"
                    ? target.getLastChild()!
                    : target.getFirstChild()!;
        }
        if (focusNode.getKey() !== target.getKey()) return false;
        const offset = selection.focus.offset;
        if (isTextNode(focusNode)) {
            return edge === "end"
                ? offset === focusNode.getTextContentSize()
                : offset === 0;
        }
        if (isElementNode(focusNode)) {
            return edge === "end"
                ? offset === focusNode.getChildrenSize()
                : offset === 0;
        }
        return false;
    }

    function skipPastCell(
        cell: LexicalNode,
        direction: "down" | "up",
    ): boolean {
        const sibling =
            direction === "down"
                ? cell.getNextSibling()
                : cell.getPreviousSibling();
        if (sibling && isElementNode(sibling)) {
            if (direction === "down") sibling.selectStart();
            else sibling.selectEnd();
            return true;
        }
        // No paragraph on that side — create one so the caret has somewhere
        // to land. (The insert command already adds a trailing paragraph, so
        // this mainly covers a cell that's the first/last node in the doc.)
        const paragraph = createParagraphNode();
        if (direction === "down") {
            cell.insertAfter(paragraph);
            paragraph.selectStart();
        } else {
            cell.insertBefore(paragraph);
            paragraph.selectEnd();
        }
        return true;
    }

    function handleArrow(
        direction: "down" | "up",
        event: KeyboardEvent | null,
    ): boolean {
        // Ignore shift/alt/meta combos so we don't break selection-extension
        // or word/line jumps.
        if (event && (event.shiftKey || event.altKey || event.metaKey)) {
            return false;
        }
        const selection = getSelection();

        // If the cell is currently node-selected (e.g. arrow already crossed
        // into it), bounce past it in the pressed direction.
        if (isNodeSelection(selection)) {
            const cell = selection.getNodes().find(isJuliaCellNode);
            if (!cell) return false;
            const moved = skipPastCell(cell, direction);
            if (moved) event?.preventDefault();
            return moved;
        }

        if (!isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
        }

        const top = selection.focus.getNode().getTopLevelElement();
        if (!top) return false;
        const adjacent =
            direction === "down" ? top.getNextSibling() : top.getPreviousSibling();
        if (!isJuliaCellNode(adjacent)) return false;
        if (!isAtTopBlockEdge(selection, direction === "down" ? "end" : "start")) {
            return false;
        }
        const moved = skipPastCell(adjacent, direction);
        if (moved) event?.preventDefault();
        return moved;
    }

    onMount(() => {
        const unregisterInsert = editor.registerCommand<void>(
            INSERT_JULIA_CELL_COMMAND,
            () => {
                editor.update(() => {
                    const node = createJuliaCellNode("", "", false, [], "both", true);
                    insertNodeToNearestRoot(node);
                    // Block decorators don't auto-create a trailing paragraph;
                    // add one so the caret can move past the cell.
                    if (node.getNextSibling() === null) {
                        node.insertAfter(createParagraphNode());
                    }
                });
                return true;
            },
            COMMAND_PRIORITY_EDITOR,
        );

        const unregisterDown = editor.registerCommand<KeyboardEvent | null>(
            KEY_ARROW_DOWN_COMMAND,
            (event) => handleArrow("down", event),
            COMMAND_PRIORITY_HIGH,
        );
        const unregisterUp = editor.registerCommand<KeyboardEvent | null>(
            KEY_ARROW_UP_COMMAND,
            (event) => handleArrow("up", event),
            COMMAND_PRIORITY_HIGH,
        );

        return () => {
            unregisterInsert();
            unregisterDown();
            unregisterUp();
        };
    });
</script>

{@render children?.()}
