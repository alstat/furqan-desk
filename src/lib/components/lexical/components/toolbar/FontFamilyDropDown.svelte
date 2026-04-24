<script lang="ts">
    import { $patchStyleText as patchStyleText } from "@lexical/selection";
    import { $getSelection as getSelection } from "lexical";
    import { getContext } from "svelte";
    import type { Writable } from "svelte/store";
    import {
        getActiveEditor,
        getIsEditable,
    } from "$lexical/core/composerContext.js";
    import { customFontFamilies } from "$lib/stores/editor.store";
    import { openCustomFontDialog } from "$lib/stores/custom-font-dialog.store";
    import { t } from "$lib/i18n";
    import DropDown from "../generic/dropdown/DropDown.svelte";
    import DropDownItem from "../generic/dropdown/DropDownItem.svelte";

    const FONT_FAMILY_OPTIONS: [string, string][] = [
        ["Amiri Quran", "Amiri Quran ء"],
        ["Aref Ruqaa Ink", "Aref Ruqaa Ink ء"],
        ["Arial", "Arial"],
        ["Courier New", "Courier New"],
        ["EB Garamond", "EB Garamond"],
        ["Georgia", "Georgia"],
        ["Reem Kufi Ink", "Reem Kufi Ink ء"],
        ["Scheherazade New", "Scheherazade New ء"],
        ["Times New Roman", "Times New Roman"],
        ["Trebuchet MS", "Trebuchet MS"],
        ["Verdana", "Verdana"],
    ];

    const activeEditor = getActiveEditor();
    const value: Writable<string> = getContext("fontFamily");
    const style = "font-family";
    const isEditable = getIsEditable();

    const allFontOptions = $derived.by(() => {
        const seen = new Set(
            FONT_FAMILY_OPTIONS.map(([font]) => font.toLocaleLowerCase()),
        );
        const customOptions: [string, string][] = [];

        for (const font of $customFontFamilies) {
            const key = font.toLocaleLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            customOptions.push([font, font]);
        }

        return [...FONT_FAMILY_OPTIONS, ...customOptions].sort(([a], [b]) =>
            a.localeCompare(b),
        );
    });

    const handleClick = (option: string) => {
        $activeEditor.update(() => {
            const selection = getSelection();
            if (selection !== null) {
                patchStyleText(selection, {
                    [style]: option,
                });
            }
        });
    };

    const buttonAriaLabel = "Formatting options for font family";
</script>

<DropDown
    disabled={!$isEditable}
    buttonClassName="w-26 hidden sm:block"
    buttonIconClassName="w-26 "
    buttonLabel={$value}
    {buttonAriaLabel}
>
    <!-- <Icon slot="buttonIconClassName" icon={icons["fontFamily"]}/> -->
    <DropDownItem
        class="item w-36"
        onclick={openCustomFontDialog}
    >
        <span class="text">+ {$t('settings.custom_fonts.add_custom')}</span>
    </DropDownItem>
    {#each allFontOptions as [option, text]}
        <DropDownItem
            class={`item w-36 ${$value === option ? "active dropdown-item-active" : ""}`}
            onclick={() => handleClick(option)}
        >
            <span class="text">{text}</span>
        </DropDownItem>
    {/each}
</DropDown>
