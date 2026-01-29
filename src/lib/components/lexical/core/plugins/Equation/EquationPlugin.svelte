<script module lang="ts">
	import { $getRoot as getRoot, COMMAND_PRIORITY_EDITOR, createCommand, type LexicalCommand } from 'lexical';

	interface InsertEquationPayload {
		equation: string;
		inline?: boolean;
	}

	export const INSERT_EQUATION_COMMAND: LexicalCommand<InsertEquationPayload> =
		createCommand('INSERT_EQUATION_COMMAND');
</script>

<script lang="ts">
	import { getEditor } from '$lexical/core/composerContext.js';
	import { onMount } from 'svelte';
	import { $createEquationNode as createEquationNode } from './EquationNode';
    import { $getSelection as getSelection } from 'lexical';

	const editor = getEditor();

	interface Props {
		captionsEnabled?: boolean;
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	onMount(() => {
        console.log("EquationPlugin: onMount");
		editor.registerCommand<InsertEquationPayload>(
        INSERT_EQUATION_COMMAND,
        (payload: InsertEquationPayload) => {
            editor.update(() => {
                const equationNode = createEquationNode(
                    payload.equation, 
                    payload.inline == undefined ? true : payload.inline
                );
                // Get current selection and insert at that point
                const selection = getSelection();
                if (selection) {
                    selection.insertNodes([equationNode]);
                } else {
                    // Fallback to appending to root
                    getRoot().append(equationNode);
                }
            });
            return true;
        },
        COMMAND_PRIORITY_EDITOR
    );
	});
</script>

{@render children?.()}
