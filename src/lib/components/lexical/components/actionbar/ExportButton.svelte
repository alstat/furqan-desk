<script lang="ts">
    import Icon from "@iconify/svelte";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { IS_APPLE } from "@lexical/utils";
    import { saveFile } from "$lib/actions/fileActions";
    import { t } from "$lib/i18n";

    // The Cmd/Ctrl+S shortcut is owned by the native application menu
    // (File > Save) so the menu item and the keyboard shortcut stay in sync.
</script>

<button
    class={actionBtnStyle}
    onclick={saveFile}
    title={IS_APPLE ? `${$t('toolbar.save')} (⌘S)` : `${$t('toolbar.save')} (Ctrl+S)`}
    aria-label={$t('toolbar.save')}
>
    <Icon icon="solar:diskette-bold-duotone" width="1rem" />
</button>
