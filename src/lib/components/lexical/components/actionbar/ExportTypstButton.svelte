<script lang="ts">
    import Icon from "@iconify/svelte";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { save as saveDialog } from "@tauri-apps/plugin-dialog";
    import { writeTextFile } from "@tauri-apps/plugin-fs";
    import { get } from "svelte/store";
    import { lexicalEditorInstance } from "$lib/stores/editor.store";
    import { activeTab, openOrFocusTab } from "$lib/stores/tabs.store";
    import { t } from "$lib/i18n";
    import { lexicalStateToTypst } from "$lib/components/lexical/utils/lexicalToTypst";

    async function exportTypst() {
        const tab = get(activeTab);
        if (!tab || tab.type !== "lexical") return;
        const editor = get(lexicalEditorInstance);
        if (!editor) return;

        // Ask for the destination first: image paths in the .typ are written
        // relative to where the file will live.
        const path = await saveDialog({
            title: $t("toolbar.export_typst"),
            defaultPath: `${tab.name}.typ`,
            filters: [{ name: "Typst Document", extensions: ["typ"] }],
        });
        if (!path) return;

        const baseDir = path.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
        const rootJson = editor.getEditorState().toJSON().root;
        const source = await lexicalStateToTypst(rootJson, tab.name, { baseDir });
        await writeTextFile(path, source);
        // Open the exported file right away so it lands in the Typst editor.
        openOrFocusTab(path, source);
    }
</script>

<button
    class={actionBtnStyle}
    onclick={exportTypst}
    title={$t("toolbar.export_typst")}
    aria-label={$t("toolbar.export_typst")}
>
    <Icon icon="tabler:file-typography" width="1rem" />
</button>
