<script lang="ts">
    import { $patchStyleText as patchStyleText } from "@lexical/selection";
    import {
        $getSelection as getSelection,
        $isRangeSelection as isRangeSelection,
    } from "lexical";
    import { getContext } from "svelte";
    import type { Readable } from "svelte/store";
    import { getEditor, getIsEditable } from "$lexical/core/composerContext.js";
    import DropDown from "../generic/dropdown/DropDown.svelte";
    import DropDownItem from "../generic/dropdown/DropDownItem.svelte";

    const FONT_SIZE_OPTIONS: [string, string][] = [
        ["10px", "10px"],
        ["11px", "11px"],
        ["12px", "12px"],
        ["14px", "14px"],
        ["16px", "16px"],
        ["18px", "18px"],
        ["24px", "24px"],
        ["30px", "30px"],
        ["36px", "36px"],
        ["48px", "48px"],
        ["60px", "60px"],
    ];

    const editor = getEditor();
    const value: Readable<string> = getContext("fontSize");
    const style = "font-size";
    const isEditable = getIsEditable();

    const handleClick = (option: string) => {
        editor.update(() => {
            const selection = getSelection();
            if (isRangeSelection(selection)) {
                patchStyleText(selection, {
                    [style]: option,
                });
            }
        });
    };

    const buttonAriaLabel = "Formatting options for font size";
</script>

<DropDown
    disabled={!$isEditable}
    buttonClassName={"w-12 hidden sm:block " + style}
    buttonLabel={$value}
    buttonIconClassName="w-12 "
    {buttonAriaLabel}
>
    {#each FONT_SIZE_OPTIONS as [option, text]}
        <DropDownItem
            class={`item w-16 flex justify-center ${
                $value === option ? "active dropdown-item-active" : ""
            } 'fontsize-item'`}
            onclick={() => handleClick(option)}
        >
            <span class="text">{text}</span>
        </DropDownItem>
    {/each}
</DropDown>
