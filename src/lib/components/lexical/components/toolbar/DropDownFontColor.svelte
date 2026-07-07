<script lang="ts">
    import { $patchStyleText as patchStyleText } from "@lexical/selection";
    import { $getSelection as getSelection } from "lexical";
    import { getContext } from "svelte";
    import { fly } from "svelte/transition";
    import type { Writable } from "svelte/store";
    import Portal from "../generic/portal/Portal.svelte";
    import ColorPicker from "../generic/colorpicker/ColorPicker.svelte";
    import { toolBarBtnStyle, activeBtnStyle } from "$lib/data/toolbar/toolbar";
    import {
        getActiveEditor,
        getIsEditable,
    } from "$lexical/core/composerContext.js";
    import { t } from "$lib/i18n";

    const activeEditor = getActiveEditor();
    const isEditable = getIsEditable();
    const fontColor = getContext<Writable<string>>("fontColor");

    let isOpen = $state(false);
    let buttonRef = $state<HTMLButtonElement | undefined>();
    let panelRef = $state<HTMLDivElement | undefined>();

    $effect(() => {
        if (isOpen && buttonRef && panelRef) {
            const { top, left } = buttonRef.getBoundingClientRect();
            panelRef.style.top = `${top + 34}px`;
            panelRef.style.left = `${Math.min(left, window.innerWidth - panelRef.offsetWidth - 20)}px`;
        }
    });

    function handleClickOutside(event: MouseEvent) {
        if (!isOpen) return;
        const target = event.target as Node;
        if (buttonRef?.contains(target) || panelRef?.contains(target)) return;
        isOpen = false;
    }

    // Same handler as FontColorButton: apply `color` to the selection. The rich
    // ColorPicker (picker + hex + palette) fires this continuously; the historic
    // tag keeps drag updates out of the undo stack.
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

    $effect(() => {
        window.addEventListener("click", handleClickOutside);
        return () => window.removeEventListener("click", handleClickOutside);
    });
</script>

<button
    bind:this={buttonRef}
    type="button"
    disabled={!$isEditable}
    onclick={() => (isOpen = !isOpen)}
    class={"p-1 " + toolBarBtnStyle + (isOpen ? " " + activeBtnStyle : "")}
    title={$t("toolbar.font_color")}
    aria-label={$t("toolbar.font_color")}
>
    <div class="flex flex-col items-center leading-none" style="width:1rem;">
        <span
            class="flex h-3.5 items-center justify-center text-[13px] font-bold text-brand-charcoal-700 dark:text-[#c6d0f5] select-none"
            >A</span
        >
        <span
            class="mt-px h-0.75 w-full rounded-full"
            style="background-color: {$fontColor};"
        ></span>
    </div>
</button>

{#if isOpen}
    <Portal>
        <div
            bind:this={panelRef}
            transition:fly={{ y: 8, duration: 180, opacity: 0 }}
            class="absolute z-10000 overflow-hidden rounded-2xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#292c3c] shadow-xl dark:shadow-black/40 px-2 py-2"
        >
            <ColorPicker color={$fontColor} onChange={onFontColorSelect} />
        </div>
    </Portal>
{/if}
