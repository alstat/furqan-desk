<script lang="ts">
    import {
        FORMAT_ELEMENT_COMMAND,
        INDENT_CONTENT_COMMAND,
        OUTDENT_CONTENT_COMMAND,
    } from "lexical";
    import DropDown from "../generic/dropdown/DropDown.svelte";
    import DropDownItem from "../generic/dropdown/DropDownItem.svelte";
    import Divider from "./Divider.svelte";
    import {
        getActiveEditor,
        getIsEditable,
    } from "$lexical/core/composerContext.js";
    import { getContext } from "svelte";
    import type { Writable } from "svelte/store";
    import Icon from "@iconify/svelte";
    import { icons } from "$lib/data/toolbar/toolbar";
    import { t } from "$lib/i18n";

    const activeEditor = getActiveEditor();
    const isRTL: Writable<boolean> = getContext("isRTL");
    const isEditable = getIsEditable();
</script>

<DropDown
    disabled={!$isEditable}
    buttonIconClassName="left"
    buttonClassName="toolbar-item spaced alignment z-100"
    buttonAriaLabel="Formatting options for text alignment"
>
    <DropDownItem
        onclick={() => {
            $activeEditor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left");
        }}
        class="item"
    >
        <div class="flex flex-row items-center w-28">
            <div class="pr-2"><Icon icon={icons["left"]} width="1rem" /></div>
            <div>{$t('toolbar.left_align')}</div>
        </div>
    </DropDownItem>
    <DropDownItem
        onclick={() => {
            $activeEditor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center");
        }}
        class="item"
    >
        <div class="flex flex-row items-center w-28">
            <div class="pr-2"><Icon icon={icons["center"]} width="1rem" /></div>
            <div>{$t('toolbar.center_align')}</div>
        </div>
    </DropDownItem>
    <DropDownItem
        onclick={() => {
            $activeEditor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right");
        }}
        class="item"
    >
        <div class="flex flex-row items-center w-28">
            <div class="pr-2"><Icon icon={icons["right"]} width="1rem" /></div>
            <div>{$t('toolbar.right_align')}</div>
        </div>
    </DropDownItem>
    <DropDownItem
        onclick={() => {
            $activeEditor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "justify");
        }}
        class="item"
    >
        <div class="flex flex-row items-center w-28">
            <div class="pr-2">
                <Icon icon={icons["justify"]} width="1rem" />
            </div>
            <div>{$t('toolbar.justify_align')}</div>
        </div>
    </DropDownItem>
</DropDown>
