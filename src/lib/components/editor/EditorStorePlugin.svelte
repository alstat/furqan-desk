<script lang="ts">
    import { getEditor } from '$lib/components/lexical/core/composerContext';
    import { lexicalEditorInstance } from '$lib/stores/editor.store';

    const editor = getEditor();

    $effect(() => {
        lexicalEditorInstance.set(editor);
        return () => lexicalEditorInstance.set(null);
    });
</script>
