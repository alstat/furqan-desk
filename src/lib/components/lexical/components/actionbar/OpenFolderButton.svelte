<script lang="ts">
    import Icon from "@iconify/svelte";
    import { openFolder } from "$lib/actions/fileActions";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { t } from "$lib/i18n";
</script>

<button
    class={actionBtnStyle}
    onclick={openFolder}
    title={$t("explorer.open_folder")}
    aria-label={$t("explorer.open_folder")}
>
    <Icon icon="solar:folder-with-files-bold-duotone" width="1rem" />
</button>
