<script lang="ts">
    import Icon from "@iconify/svelte";
    import type { LexicalEditor } from "lexical";
    import { getEditor } from "$lexical/core/composerContext.js";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { save } from "@tauri-apps/plugin-dialog";
    import { writeTextFile } from "@tauri-apps/plugin-fs";
    import { serializedDocumentFromEditorState } from "@lexical/file";
    import { onMount } from "svelte";
    import { IS_APPLE } from "@lexical/utils";

    const editor: LexicalEditor = getEditor();
    let currentFilePath = $state<string | null>(null);

    async function saveFile() {
        const doc = serializedDocumentFromEditorState(editor.getEditorState(), {
            source: "Playground",
        });
        const json = JSON.stringify(doc, null, 2);

        if (!currentFilePath) {
            const filePath = await save({
                title: "Save Editor File",
                defaultPath: `Playground ${new Date().toISOString()}.lexical`,
                filters: [
                    { name: "Lexical Editor File", extensions: ["lexical", "json"] },
                ],
            });
            if (!filePath) return;
            currentFilePath = filePath;
        }

        await writeTextFile(currentFilePath, json);
    }

    function handleKeyDown(event: KeyboardEvent) {
        if ((IS_APPLE ? event.metaKey : event.ctrlKey) && event.key === "s") {
            event.preventDefault();
            saveFile();
        }
    }

    onMount(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    });
</script>

<button
    class={actionBtnStyle + " p-1"}
    onclick={saveFile}
    title={IS_APPLE ? "Save (⌘S)" : "Save (Ctrl+S)"}
    aria-label="Save editor state"
>
    <Icon icon="solar:diskette-bold-duotone" width="1rem" />
</button>
