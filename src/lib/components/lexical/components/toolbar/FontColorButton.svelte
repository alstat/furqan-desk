<script lang="ts">
    import { getContext } from "svelte";
    import { getActiveEditor } from "$lexical/core/composerContext.js";
    import ColorPickerDialog from "../generic/colorpicker/ColorPickerDialog.svelte";
    import { $patchStyleText as patchStyleText } from "@lexical/selection";
    import { $getSelection as getSelection } from "lexical";
    import type { Writable } from "svelte/store";
    import { toolBarBtnStyle } from "$lib/data/toolbar/toolbar";
    import { t } from "$lib/i18n";

    const fontColor = getContext<Writable<string>>("fontColor");
    const activeEditor = getActiveEditor();

    let colorPickerDialog: ColorPickerDialog;
    let buttonEl: HTMLButtonElement;

    function onFontColorSelect(value: string, skipHistoryStack: boolean) {
        $activeEditor.update(
            () => {
                const selection = getSelection();
                if (selection !== null) {
                    patchStyleText(selection, { color: value });
                }
            },
            skipHistoryStack ? { tag: "historic" } : {},
        );
    }
</script>

<button
    type="button"
    class={"p-1 " + toolBarBtnStyle}
    title={$t('toolbar.font_color')}
    bind:this={buttonEl}
    onclick={() => colorPickerDialog.open(onFontColorSelect, buttonEl)}
    aria-label={$t('toolbar.font_color')}
>
    <div class="flex flex-col items-center leading-none" style="width:1rem;">
        <span
            class="text-[0.8125rem] font-bold text-brand-charcoal-700 dark:text-[#c6d0f5] leading-tight select-none"
            >A</span
        >
        <span
            class="mt-px h-0.75 w-full rounded-full"
            style="background-color: {$fontColor};"
        ></span>
    </div>
</button>

<ColorPickerDialog
    title={$t('toolbar.font_color')}
    color={$fontColor}
    bind:this={colorPickerDialog}
/>
