<script lang="ts">
    import Icon from "@iconify/svelte";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { save as saveDialog } from "@tauri-apps/plugin-dialog";
    import { writeFile } from "@tauri-apps/plugin-fs";
    import { get } from "svelte/store";
    import { lexicalEditorInstance } from "$lib/stores/editor.store";
    import { activeTab, tabs } from "$lib/stores/tabs.store";
    import { t } from "$lib/i18n";
    import { lexicalStateToDocxBlob } from "$lib/components/lexical/utils/lexicalToDocx";

    // tabId scopes the export to a specific panel in split layouts.
    let {
        tabId = null,
        btnClass = actionBtnStyle,
    }: { tabId?: string | null; btnClass?: string } = $props();

    async function exportDocx() {
        const tab = tabId
            ? (get(tabs).find((tb) => tb.id === tabId) ?? null)
            : get(activeTab);
        if (!tab || tab.type !== "lexical") return;
        const editor = get(lexicalEditorInstance);
        if (!editor) return;

        const rootJson = editor.getEditorState().toJSON().root;
        const blob = await lexicalStateToDocxBlob(rootJson, tab.name);

        const path = await saveDialog({
            title: $t("toolbar.export_docx"),
            defaultPath: `${tab.name}.docx`,
            filters: [{ name: "Word Document", extensions: ["docx"] }],
        });
        if (!path) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        await writeFile(path, bytes);
    }
</script>

<button
    class={btnClass}
    onclick={exportDocx}
    title={$t("toolbar.export_docx")}
    aria-label={$t("toolbar.export_docx")}
>
    <Icon icon="tabler:file-type-docx" width="1rem" />
</button>
