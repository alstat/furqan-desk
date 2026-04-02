<script lang="ts">
    import Icon from "@iconify/svelte";
    import { open as openDialog } from "@tauri-apps/plugin-dialog";
    import { openFolderPath } from "$lib/stores/tabs.store";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { t } from "$lib/i18n";

    async function openFolder() {
        const result = await openDialog({ directory: true, multiple: false });
        if (!result || Array.isArray(result)) return;
        openFolderPath.set(result as string);
    }
</script>

<button
    class={actionBtnStyle}
    onclick={openFolder}
    title={$t("explorer.open_folder")}
    aria-label={$t("explorer.open_folder")}
>
    <Icon icon="solar:folder-with-files-bold-duotone" width="1rem" />
</button>
