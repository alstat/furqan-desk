<script lang="ts">
    import Icon from "@iconify/svelte";
    import type { LexicalEditor } from "lexical";
    import { getEditor } from "$lexical/core/composerContext.js";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { save } from "@tauri-apps/plugin-dialog";
    import { writeTextFile } from "@tauri-apps/plugin-fs";
    import { serializedDocumentFromEditorState } from "@lexical/file";

    const editor: LexicalEditor = getEditor();

    async function handleExport() {
        const doc = serializedDocumentFromEditorState(editor.getEditorState(), {
            source: "Playground",
        });
        const json = JSON.stringify(doc, null, 2);

        const filePath = await save({
            title: "Export Editor File",
            defaultPath: `Playground ${new Date().toISOString()}.lexical`,
            filters: [
                {
                    name: "Lexical Editor File",
                    extensions: ["lexical", "json"],
                },
            ],
        });

        if (filePath) {
            await writeTextFile(filePath, json);
        }
    }
</script>

<button
    class={actionBtnStyle + " p-1"}
    onclick={handleExport}
    title="Export"
    aria-label="Export editor state to JSON"
>
    <Icon icon="solar:export-bold-duotone" width="1rem" />
</button>
