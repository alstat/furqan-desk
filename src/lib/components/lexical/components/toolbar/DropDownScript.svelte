<script lang="ts">
    import { FORMAT_TEXT_COMMAND, type TextFormatType } from "lexical";
    import { getContext } from "svelte";
    import { fly } from "svelte/transition";
    import type { Writable } from "svelte/store";
    import Portal from "../generic/portal/Portal.svelte";
    import Icon from "@iconify/svelte";
    import {
        icons,
        toolBarBtnStyle,
        activeBtnStyle,
    } from "$lib/data/toolbar/toolbar";
    import {
        getActiveEditor,
        getIsEditable,
    } from "$lexical/core/composerContext.js";
    import { t } from "$lib/i18n";

    const activeEditor = getActiveEditor();
    const isEditable = getIsEditable();
    const isSuperscript: Writable<boolean> = getContext("isSuperscript");
    const isSubscript: Writable<boolean> = getContext("isSubscript");

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

    // Toggle a text format without letting the toolbar steal focus from the
    // editor: preventDefault on mousedown keeps the live selection (including a
    // collapsed cursor's pending format), so toggling reliably turns the format
    // both on AND off — including for subsequent typing on a new line.
    function applyFormat(format: TextFormatType) {
        $activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
        isOpen = false;
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
    onmousedown={(e) => e.preventDefault()}
    onclick={() => (isOpen = !isOpen)}
    class={"p-1 flex items-center gap-0.5 " +
        toolBarBtnStyle +
        (isOpen || $isSuperscript || $isSubscript
            ? " " + activeBtnStyle
            : "")}
    title={`${$t("toolbar.superscript")} / ${$t("toolbar.subscript")}`}
    aria-label={`${$t("toolbar.superscript")} / ${$t("toolbar.subscript")}`}
>
    <Icon icon={icons["superscript"]} height="1rem" />
    <Icon icon={icons["dropdown"]} height="0.75rem" />
</button>

{#if isOpen}
    <Portal>
        <div
            bind:this={panelRef}
            transition:fly={{ y: 8, duration: 180, opacity: 0 }}
            class="absolute z-10000 block w-auto rounded-3xl border border-brand-sand-200 bg-brand-sand-50 bg-opacity-95 p-2 shadow-xl backdrop-blur-sm"
        >
            <button
                type="button"
                onmousedown={(e) => e.preventDefault()}
                onclick={() => applyFormat("superscript")}
                class={"cursor-pointer flex flex-row justify-start p-1 m-1 text-xs rounded-full px-3 text-brand-charcoal-500 hover:bg-brand-sand-200 hover:text-brand-charcoal-900 active:bg-brand-sand-400 " +
                    ($isSuperscript ? "active dropdown-item-active" : "")}
            >
                <div class="flex flex-row items-center w-28">
                    <div class="pr-2">
                        <Icon icon={icons["superscript"]} width="1rem" />
                    </div>
                    <div>{$t("toolbar.superscript")}</div>
                </div>
            </button>
            <button
                type="button"
                onmousedown={(e) => e.preventDefault()}
                onclick={() => applyFormat("subscript")}
                class={"cursor-pointer flex flex-row justify-start p-1 m-1 text-xs rounded-full px-3 text-brand-charcoal-500 hover:bg-brand-sand-200 hover:text-brand-charcoal-900 active:bg-brand-sand-400 " +
                    ($isSubscript ? "active dropdown-item-active" : "")}
            >
                <div class="flex flex-row items-center w-28">
                    <div class="pr-2">
                        <Icon icon={icons["subscript"]} width="1rem" />
                    </div>
                    <div>{$t("toolbar.subscript")}</div>
                </div>
            </button>
        </div>
    </Portal>
{/if}
