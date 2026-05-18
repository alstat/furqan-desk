<script module lang="ts">
    import { COMMAND_PRIORITY_EDITOR, createCommand, type LexicalCommand } from "lexical";

    export const INSERT_JULIA_CELL_COMMAND: LexicalCommand<void> = createCommand(
        "INSERT_JULIA_CELL_COMMAND",
    );
</script>

<script lang="ts">
    import { getEditor } from "$lexical/core/composerContext.js";
    import { onMount } from "svelte";
    import { $createParagraphNode as createParagraphNode } from "lexical";
    import { $insertNodeToNearestRoot as insertNodeToNearestRoot } from "@lexical/utils";
    import { $createJuliaCellNode as createJuliaCellNode } from "./JuliaCellNode";

    const editor = getEditor();

    let { children }: { children?: import("svelte").Snippet } = $props();

    onMount(() => {
        return editor.registerCommand<void>(
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
    });
</script>

{@render children?.()}
