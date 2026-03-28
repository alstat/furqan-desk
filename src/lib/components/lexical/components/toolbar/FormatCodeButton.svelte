<script lang="ts">
    import { FORMAT_TEXT_COMMAND } from "lexical";
    import { getContext } from "svelte";
    import Icon from "@iconify/svelte";
    import { icons, activeBtnStyle } from "$lib/data/toolbar/toolbar";
    import type { Writable } from "svelte/store";
    import {
        getActiveEditor,
        getIsEditable,
    } from "$lexical/core/composerContext.js";
    import InsertCodeDialog from "./dialogs/InsertCodeDialog.svelte";
    import DropDown from "../generic/dropdown/DropDown.svelte";
    import DropDownItem from "../generic/dropdown/DropDownItem.svelte";

    const isEditable = getIsEditable();
    const activeEditor = getActiveEditor();
    const isCode: Writable<boolean> = getContext("isCode");

    let showCodeModal = $state(false);

    function openInline() {
        $activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
    }

    function openBlock() {
        showCodeModal = true;
    }
</script>

<DropDown
    disabled={!$isEditable}
    buttonIconClassName="code"
    buttonClassName={$isCode ? activeBtnStyle : ""}
    buttonAriaLabel="Insert code"
    title="Insert code"
>
    <DropDownItem onclick={openInline} class="item">
        <div class="flex flex-row items-center gap-2 w-28">
            <Icon icon="solar:code-bold-duotone" width="0.9rem" />
            <div>Inline</div>
        </div>
    </DropDownItem>
    <DropDownItem onclick={openBlock} class="item">
        <div class="flex flex-row items-center gap-2 w-28">
            <Icon icon="solar:code-square-bold-duotone" width="0.9rem" />
            <div>Block</div>
        </div>
    </DropDownItem>
</DropDown>

<InsertCodeDialog bind:showModal={showCodeModal} />
