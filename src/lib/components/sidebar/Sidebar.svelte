<script lang="ts">
    import { get } from 'svelte/store';
    import CollapsibleSidebar from "$lib/components/shared/CollapsibleSidebar.svelte";
    import RichTextEditor from "$lib/components/editor/EditorComposer.svelte";
    import TypstEditor from "$lib/components/editor/TypstEditor.svelte";
    import { typstMode, typstSource, lexicalSnapshot, lexicalEditorInstance } from '$lib/stores/editor.store';
    import { lexicalToTypst } from '$lib/functions/utils/typstConverters';

    $effect(() => {
        if ($typstMode) {
            // Entering Typst mode — snapshot Lexical state and convert to Typst
            const editor = get(lexicalEditorInstance);
            if (editor) {
                const json = JSON.stringify(editor.getEditorState().toJSON());
                lexicalSnapshot.set(json);
                typstSource.set(lexicalToTypst(json));
            }
        } else {
            // Exiting Typst mode — always restore the saved Lexical snapshot
            const snap   = get(lexicalSnapshot);
            const editor = get(lexicalEditorInstance);
            if (snap && editor) {
                const state = editor.parseEditorState(snap);
                editor.setEditorState(state);
            }
        }
    });
</script>

<CollapsibleSidebar>
    <div class="h-full overflow-visible">
        {#if $typstMode}
            <TypstEditor />
        {:else}
            <RichTextEditor />
        {/if}
    </div>
</CollapsibleSidebar>
