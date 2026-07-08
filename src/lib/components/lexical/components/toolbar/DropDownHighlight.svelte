<script lang="ts">
    import { $patchStyleText as patchStyleText } from "@lexical/selection";
    import { $getSelection as getSelection } from "lexical";
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
    const bgColor = getContext<Writable<string>>("bgColor");

    // Preset highlighter colors (applied as text background).
    const HIGHLIGHTS = [
        { key: "yellow", value: "#fff3a3" },
        { key: "green", value: "#c3f0c8" },
        { key: "blue", value: "#bfe3ff" },
        { key: "pink", value: "#ffc9e3" },
        { key: "orange", value: "#ffd9a8" },
        { key: "purple", value: "#e3cdff" },
    ];

    let isOpen = $state(false);
    let buttonRef = $state<HTMLButtonElement | undefined>();
    let panelRef = $state<HTMLDivElement | undefined>();

    // Normalised current highlight; treat the default white as "no highlight".
    let current = $derived(
        $bgColor && $bgColor.toLowerCase() !== "#fff" && $bgColor !== "#ffffff"
            ? $bgColor.toLowerCase()
            : "",
    );

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

    // preventDefault on mousedown keeps the editor's selection so the highlight
    // reliably applies to the selected text (and toggling off works).
    function applyHighlight(color: string | null) {
        $activeEditor.update(() => {
            const selection = getSelection();
            if (selection !== null) {
                patchStyleText(selection, { "background-color": color });
            }
        });
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
    class={"p-1 " +
        toolBarBtnStyle +
        (isOpen || current ? " " + activeBtnStyle : "")}
    title={$t("toolbar.highlight")}
    aria-label={$t("toolbar.highlight")}
>
    <div class="flex flex-col items-center leading-none" style="width:1rem;">
        <span class="flex h-3.5 items-center justify-center">
            <Icon icon={icons["highlight"]} height="0.85rem" />
        </span>
        <span
            class="mt-px h-0.75 w-full rounded-full"
            style="background-color: {current || 'transparent'};"
        ></span>
    </div>
</button>

{#if isOpen}
    <Portal>
        <div
            bind:this={panelRef}
            transition:fly={{ y: 8, duration: 180, opacity: 0 }}
            class="absolute z-10000 rounded-2xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#292c3c] bg-opacity-95 shadow-xl backdrop-blur-sm p-4"
        >
            <div class="grid grid-cols-6 gap-3">
                {#each HIGHLIGHTS as h}
                    <button
                        type="button"
                        onmousedown={(e) => e.preventDefault()}
                        onclick={() => applyHighlight(h.value)}
                        title={$t(`toolbar.highlight_${h.key}`)}
                        aria-label={$t(`toolbar.highlight_${h.key}`)}
                        class={`rounded-full inset-shadow-2xs size-5 cursor-pointer transition-[transform,box-shadow] duration-100 hover:scale-[1.18] ${
                            current === h.value
                                ? "shadow-[0_0_0_2.5px_var(--color-brand-gold-400)] border-transparent"
                                : "border-brand-sand-200"
                        }`}
                        style="background-color: {h.value};"
                    ></button>
                {/each}
            </div>
            <button
                type="button"
                onmousedown={(e) => e.preventDefault()}
                onclick={() => applyHighlight(null)}
                class="mt-3 cursor-pointer flex w-full items-center gap-2 rounded-full px-2 py-1 text-left text-xs text-brand-charcoal-500 hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900"
            >
                <Icon icon={icons["clearFormat"]} width="0.9rem" />
                <span>{$t("toolbar.highlight_none")}</span>
            </button>
        </div>
    </Portal>
{/if}
