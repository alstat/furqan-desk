<script lang="ts">
    import { onMount } from "svelte";
    import { getEditor } from "$lexical/core/composerContext.js";
    import {
        $createParagraphNode as createParagraphNode,
        $isRootNode as isRootNode,
    } from "lexical";
    import { QuranBlockNode } from "./QuranBlockNode";

    const editor = getEditor();

    onMount(() => {
        // Self-heal: if a QuranBlock has no previous/next sibling at the root
        // level, insert an empty paragraph there so the cursor can navigate
        // above and below the block (DecoratorNodes don't accept the caret).
        return editor.registerNodeTransform(QuranBlockNode, (node) => {
            const parent = node.getParent();
            if (!parent || !isRootNode(parent)) return;
            if (node.getPreviousSibling() === null) {
                node.insertBefore(createParagraphNode());
            }
            if (node.getNextSibling() === null) {
                node.insertAfter(createParagraphNode());
            }
        });
    });
</script>
