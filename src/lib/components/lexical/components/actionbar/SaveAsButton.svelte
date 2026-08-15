<script lang="ts">
    import Icon from "@iconify/svelte";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { IS_APPLE } from "@lexical/utils";
    import { saveAs } from "$lib/actions/fileActions";
    import { t } from "$lib/i18n";

    // tabId scopes the save to a specific panel in split layouts.
    let { tabId = null }: { tabId?: string | null } = $props();
</script>

<button
    class={actionBtnStyle}
    onclick={() => saveAs(tabId)}
    title={IS_APPLE ? `${$t('toolbar.save_as')} (⌘⇧S)` : `${$t('toolbar.save_as')} (Ctrl+Shift+S)`}
    aria-label={$t('toolbar.save_as')}
>
    <Icon icon="material-symbols:save-as-rounded" width="1rem" />
</button>
