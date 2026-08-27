<script lang="ts">
    import { onMount } from "svelte";
    import {
        $createParagraphNode as createParagraphNode,
        $getRoot as getRoot,
        $isDecoratorNode as isDecoratorNode,
        RootNode,
    } from "lexical";
    import { getEditor } from "$lexical/core/composerContext.js";

    const editor = getEditor();

    onMount(() => {
        const unregisterTransform = editor.registerNodeTransform(
            RootNode,
            (root) => {
                const lastChild = root.getLastChild();
                if (isDecoratorNode(lastChild)) {
                    lastChild.insertAfter(createParagraphNode());
                }
            },
        );

        // Parsed files are restored with setEditorState(), which reconciles the
        // DOM without running node transforms. Repair that path in a tagged
        // follow-up update so loading an older file does not make it dirty.
        const unregisterUpdate = editor.registerUpdateListener(
            ({ editorState }) => {
                const needsParagraph = editorState.read(() =>
                    isDecoratorNode(getRoot().getLastChild()),
                );
                if (!needsParagraph) return;

                editor.update(() => {
                    const lastChild = getRoot().getLastChild();
                    if (isDecoratorNode(lastChild)) {
                        lastChild.insertAfter(createParagraphNode());
                    }
                }, { tag: "history-merge" });
            },
        );

        return () => {
            unregisterTransform();
            unregisterUpdate();
        };
    });
</script>
