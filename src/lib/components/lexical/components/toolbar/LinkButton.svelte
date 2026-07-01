<script lang="ts">
    import { TOGGLE_LINK_COMMAND } from "@lexical/link";
    import { sanitizeUrl } from "$lexical/core/plugins/link/url.js";
    import {
        getActiveEditor,
        getIsEditable,
    } from "$lexical/core/composerContext.js";
    import { getContext } from "svelte";
    import type { Writable } from "svelte/store";
    import Icon from "@iconify/svelte";
    import {
        icons,
        toolBarBtnStyle,
        activeBtnStyle,
    } from "$lib/data/toolbar/toolbar";
    import { t } from "$lib/i18n";

    const activeEditor = getActiveEditor();
    const isEditable = getIsEditable();
    const isLink: Writable<boolean> = getContext("isLink");

    // Insert a placeholder link (opens the floating URL editor) or remove the
    // existing one, mirroring InsertLink.svelte.
    function toggleLink() {
        if (!$isLink) {
            $activeEditor.dispatchCommand(
                TOGGLE_LINK_COMMAND,
                sanitizeUrl("https://"),
            );
        } else {
            $activeEditor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
        }
    }
</script>

<button
    type="button"
    disabled={!$isEditable}
    onclick={toggleLink}
    class={"p-1 " + toolBarBtnStyle + ($isLink ? "active " + activeBtnStyle : "")}
    title={$t("toolbar.insert_link")}
    aria-label={$t("toolbar.insert_link")}
>
    <Icon icon={icons["link"]} height="1rem" />
</button>
