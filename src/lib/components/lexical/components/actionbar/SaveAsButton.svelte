<script lang="ts">
    import Icon from "@iconify/svelte";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { save as saveDialog } from "@tauri-apps/plugin-dialog";
    import { writeTextFile } from "@tauri-apps/plugin-fs";
    import { serializedDocumentFromEditorState } from "@lexical/file";
    import { IS_APPLE } from "@lexical/utils";
    import { get } from "svelte/store";
    import { lexicalEditorInstance } from "$lib/stores/editor.store";
    import {
        activeTab,
        activeTabId,
        markTabSaved,
    } from "$lib/stores/tabs.store";
    import { t } from "$lib/i18n";

    async function saveAs() {
        const tab = get(activeTab);
        if (!tab) return;

        if (tab.type === "lexical") {
            const editor = get(lexicalEditorInstance);
            if (!editor) return;
            const doc = serializedDocumentFromEditorState(
                editor.getEditorState(),
                {
                    source: "AyahLab",
                },
            );
            const path = await saveDialog({
                title: "Save As",
                defaultPath: `${tab.name}.lexical`,
                filters: [
                    { name: "Lexical File", extensions: ["lexical", "json"] },
                ],
            });
            if (!path) return;
            await writeTextFile(path, JSON.stringify(doc, null, 2));
            markTabSaved(get(activeTabId)!, path);
        } else if (tab.type === "julia") {
            const path = await saveDialog({
                title: "Save As",
                defaultPath: `${tab.name}.jl`,
                filters: [{ name: "Julia", extensions: ["jl"] }],
            });
            if (!path) return;
            await writeTextFile(path, tab.content);
            markTabSaved(get(activeTabId)!, path);
        } else {
            const ext = tab.type === "typst" ? "typ" : "txt";
            const path = await saveDialog({
                title: "Save As",
                defaultPath: `${tab.name}.${ext}`,
                filters: [
                    {
                        name: "Text Files",
                        extensions: ["typ", "bib", "txt", "md"],
                    },
                ],
            });
            if (!path) return;
            await writeTextFile(path, tab.content);
            markTabSaved(get(activeTabId)!, path);
        }
    }
</script>

<button
    class={actionBtnStyle}
    onclick={saveAs}
    title={IS_APPLE ? `${$t('toolbar.save_as')} (⌘⇧S)` : `${$t('toolbar.save_as')} (Ctrl+Shift+S)`}
    aria-label={$t('toolbar.save_as')}
>
    <Icon icon="material-symbols:save-as-rounded" width="1rem" />
</button>
