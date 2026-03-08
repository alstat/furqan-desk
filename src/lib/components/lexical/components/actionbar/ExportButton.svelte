<script lang="ts">
    import Icon from "@iconify/svelte";
    import type { LexicalEditor } from "lexical";
    import { getEditor } from "$lexical/core/composerContext.js";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";

    const editor: LexicalEditor = getEditor();

    async function handleExport() {
        const json = JSON.stringify(editor.getEditorState().toJSON(), null, 2);
        const fileName = `Playground ${new Date().toISOString()}.lexical`;

        if ('showSaveFilePicker' in window) {
            try {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [
                        {
                            description: 'Lexical Editor File',
                            accept: { 'application/json': ['.lexical', '.json'] },
                        },
                    ],
                });
                const writable = await fileHandle.createWritable();
                await writable.write(json);
                await writable.close();
            } catch (err) {
                if (err instanceof Error && err.name !== 'AbortError') throw err;
            }
        } else {
            // Fallback for browsers that don't support showSaveFilePicker
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        }
    }
</script>

<button
    class={actionBtnStyle + " p-1"}
    onclick={handleExport}
    title="Export"
    aria-label="Export editor state to JSON"
>
    <Icon icon="solar:import-bold-duotone" width="1rem" />
</button>
