<script module lang="ts">
	import { COMMAND_PRIORITY_EDITOR, createCommand, type LexicalCommand } from "lexical";

    interface InsertCodePayload {
        code: string;
        language: string;
    }

    export const INSERT_CODE_COMMAND: LexicalCommand<InsertCodePayload> = createCommand('INSERT_CODE_COMMAND');
</script>

<script lang="ts">
    import { getEditor } from "$lexical/core/composerContext";
    import { onMount } from "svelte";
    import { $createCodeNode as createCodeNode } from "./CodeNode";
    import { $insertNodeToNearestRoot as insertNodeToNearestRoot } from "@lexical/utils";

    const editor = getEditor();

    interface Props {
        captionsEnabled?: boolean;
        children?: import('svelte').Snippet;
    }

    let { children }: Props = $props();

    onMount(() => {
        console.log("CodePlugin: onMount");
        editor.registerCommand<InsertCodePayload>(
            INSERT_CODE_COMMAND,
            (payload: InsertCodePayload) => {
                editor.update(() => {
                    const codeNode = createCodeNode(payload.code, payload.language);
                    insertNodeToNearestRoot(codeNode);
                });
                return true;
            },
            COMMAND_PRIORITY_EDITOR
        )
    })
</script>

{@render children?.()}
