<script lang="ts">
    import Icon from "@iconify/svelte";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { message, save as saveDialog } from "@tauri-apps/plugin-dialog";
    import { writeTextFile } from "@tauri-apps/plugin-fs";
    import { get } from "svelte/store";
    import { lexicalEditorInstance } from "$lib/stores/editor.store";
    import { activeTab, openOrFocusTab, tabs } from "$lib/stores/tabs.store";
    import { t } from "$lib/i18n";
    import { lexicalStateToTypst } from "$lib/components/lexical/utils/lexicalToTypst";

    // tabId scopes the export to a specific panel in split layouts.
    let {
        tabId = null,
        btnClass = actionBtnStyle,
    }: { tabId?: string | null; btnClass?: string } = $props();

    async function exportTypst() {
        const tab = tabId
            ? (get(tabs).find((tb) => tb.id === tabId) ?? null)
            : get(activeTab);
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

        try {
            const baseDir = path
                .replace(/\\/g, "/")
                .split("/")
                .slice(0, -1)
                .join("/");
            const rootJson = editor.getEditorState().toJSON().root;
            const source = await lexicalStateToTypst(rootJson, tab.name, {
                baseDir,
            });
            await writeTextFile(path, source);
            // Re-exporting over a file that is already open must refresh that
            // tab: openOrFocusTab alone would just focus it, leaving the
            // Typst editor showing (and compiling) the stale content.
            tabs.update((ts) =>
                ts.map((t) =>
                    t.path === path
                        ? { ...t, content: source, isDirty: false }
                        : t,
                ),
            );
            // Open the exported file right away so it lands in the Typst editor.
            openOrFocusTab(path, source);
        } catch (e) {
            // Surface conversion/write failures — a silent failure leaves the
            // previous file on disk and looks like the export "did nothing".
            console.error("[export-typst] failed:", e);
            await message(String(e), { title: "Typst export failed", kind: "error" });
        }
    }
</script>

<button
    class={btnClass}
    onclick={exportTypst}
    title={$t("toolbar.export_typst")}
    aria-label={$t("toolbar.export_typst")}
>
    <Icon icon="tabler:file-typography" width="1rem" />
</button>
