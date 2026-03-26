<script lang="ts">
    import { onMount, onDestroy, getContext } from "svelte";
    import type { Readable } from "svelte/store";
    import BoldButton from "../BoldButton.svelte";
    import ItalicButton from "../ItalicButton.svelte";
    import UnderlineButton from "../UnderlineButton.svelte";
    import StrikethroughButton from "../StrikethroughButton.svelte";
    import FormatCodeButton from "../FormatCodeButton.svelte";
    import InsertDropDown from "../InsertDropDown/InsertDropDown.svelte";
    import InsertHRDropDownItem from "../InsertDropDown/InsertHRDropDownItem.svelte";
    import InsertImageDropDownItem from "../InsertDropDown/InsertImageDropDownItem.svelte";
    import InsertEquationDropDownItem from "../InsertDropDown/InsertEquationDropDownItem.svelte";
    import DropDownAlign from "../DropDownAlign.svelte";
    import Indent from "../Indent.svelte";
    import Outdent from "../Outdent.svelte";
    import FontSizeDropDown from "../FontSizeDropDown.svelte";
    import Divider from "../Divider.svelte";
    import Portal from "../../generic/portal/Portal.svelte";
    import Icon from "@iconify/svelte";
    import {
        icons,
        toolBarBtnStyle,
        activeBtnStyle,
    } from "$lib/data/toolbar/toolbar";
    import {
        getActiveEditor,
        getEditor,
    } from "$lexical/core/composerContext.js";
    import { INSERT_HORIZONTAL_RULE_COMMAND } from "$lexical/core/plugins/HorizontalRuleNode.js";
    import { $patchStyleText as patchStyleText } from "@lexical/selection";
    import {
        $getSelection as getSelection,
        $isRangeSelection as isRangeSelection,
    } from "lexical";

    let { windowWidth, onInsertImageClick, onInsertEquationClick } = $props();

    let isOpen = $state(false);
    let dropdownRef: HTMLDivElement;
    let buttonRef = $state<HTMLButtonElement | undefined>();
    let panelRef = $state<HTMLDivElement | undefined>();
    let portalContent: HTMLElement | null = $state(null);
    const activeEditor = getActiveEditor();
    const editor = getEditor();
    const lineHeight = getContext<Readable<string>>("lineHeight");

    // Same positioning logic as DropDown.svelte — read from the button, not the wrapper
    $effect(() => {
        if (isOpen && buttonRef && panelRef) {
            const { top, left } = buttonRef.getBoundingClientRect();
            panelRef.style.top = `${top + 34}px`;
            panelRef.style.left = `${Math.min(left, window.innerWidth - panelRef.offsetWidth - 20)}px`;
        }
    });

    // Create a higher z-index for nested portals
    // This will be injected into the document head
    let zIndexStyle: HTMLStyleElement | null = $state(null);

    function toggleDropdown() {
        isOpen = !isOpen;
    }

    function handleClickOutside(event: MouseEvent) {
        // Check if the click is within our dropdown content
        // Here the !dropdownRef.contains(event.target as Node) simply checks if the mouse click
        // is clicked not on the body of the dropdownRef
        if (
            isOpen &&
            dropdownRef &&
            !dropdownRef.contains(event.target as Node)
        ) {
            // Check if we have a reference to the portal content
            if (portalContent) {
                if (!portalContent.contains(event.target as Node)) {
                    // Also check for any other dropdown items that might be open
                    const dropdownItems = document.querySelectorAll(
                        ".svelte-dropdown-items",
                    );
                    const clickedInNestedDropdown = Array.from(
                        dropdownItems,
                    ).some((item) => item.contains(event.target as Node));

                    if (!clickedInNestedDropdown) {
                        isOpen = false;
                    }
                }
            } else {
                // Fallback if we couldn't get a reference to portal content
                isOpen = false;
            }
        }
    }

    function handlePortalMount(node: HTMLElement) {
        portalContent = node;
    }

    function applyLineSpacing(lineHeight: string) {
        editor.update(() => {
            const selection = getSelection();
            if (isRangeSelection(selection)) {
                patchStyleText(selection, { "line-height": lineHeight });
            }
        });
    }

    onMount(() => {
        // Only add event listeners in the browser environment
        if (typeof window !== "undefined") {
            window.addEventListener("click", handleClickOutside);

            // Add a stylesheet that ensures nested portals have higher z-index
            // zIndexStyle = document.createElement('style');
            // zIndexStyle.textContent = `
            // 	.svelte-dropdown-items { z-index: 100 !important; }
            // 	.portal-dropdown-content + .svelte-dropdown-items { z-index: 1000 !important; }
            // `;
            // document.head.appendChild(zIndexStyle);
        }
    });

    onDestroy(() => {
        // Only remove event listeners in the browser environment
        if (typeof window !== "undefined") {
            window.removeEventListener("click", handleClickOutside);

            // // Remove the added stylesheet
            // if (zIndexStyle && zIndexStyle.parentNode) {
            // 	zIndexStyle.parentNode.removeChild(zIndexStyle);
            // }
        }
    });
</script>

<div class="relative" bind:this={dropdownRef}>
    <button
        bind:this={buttonRef}
        onclick={toggleDropdown}
        class={"p-1 " + toolBarBtnStyle + (isOpen ? " " + activeBtnStyle : "")}
        aria-label="More options"
    >
        <Icon icon={icons["tripleDots"]} height="1rem" />
    </button>

    {#if isOpen}
        <Portal>
            <div
                class="portal-dropdown-content absolute z-50 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#292c3c] bg-opacity-95 shadow-xl backdrop-blur-sm"
                style="width: 12rem;"
                bind:this={panelRef}
                use:handlePortalMount
            >
                <div class="py-1">
                    <!-- LG breakpoint items (show when width < lg) -->
                    {#if windowWidth < 1024}
                        <div class="px-2 py-1">
                            <div class="flex items-center">
                                <!-- MD breakpoint items (show when width < md) -->
                                {#if windowWidth < 768}
                                    <BoldButton />
                                    <ItalicButton />
                                {/if}
                                <UnderlineButton />
                                <StrikethroughButton />
                                <FormatCodeButton />
                            </div>
                        </div>
                        <hr class="my-1 border-brand-sand-200" />
                    {/if}

                    <!-- XL breakpoint items (show when width < xl) -->
                    <!-- {#if windowWidth < 1380} -->
                    <div class="">
                        <div class="flex items-center px-2 py-1">
                            <Indent />
                            <Outdent />
                        </div>
                        <hr class="my-1 border-brand-sand-200" />
                        <div class="px-2 py-1">
                            <span
                                class="text-xs font-medium text-brand-charcoal-500"
                                >Line Spacing</span
                            >
                            <div class="mt-1 flex flex-col space-y-1">
                                {#each [{ label: "Single", value: "1" }, { label: "1.5 Lines", value: "1.5" }, { label: "Double", value: "2" }] as spacing}
                                    <button
                                        class="cursor-pointer px-2 py-1 text-left text-xs text-brand-charcoal-500 rounded-lg hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-charcoal-900 active:bg-brand-sand-100 {$lineHeight ===
                                        spacing.value
                                            ? 'bg-brand-sand-200 text-brand-charcoal-900 font-semibold'
                                            : ''}"
                                        onclick={() =>
                                            applyLineSpacing(spacing.value)}
                                    >
                                        <div
                                            class="flex w-32 flex-row items-center"
                                        >
                                            <div class="pr-2">
                                                <Icon
                                                    icon={icons["lineSpacing"]}
                                                    width="1rem"
                                                />
                                            </div>
                                            <div>{spacing.label}</div>
                                        </div>
                                    </button>
                                {/each}
                            </div>
                        </div>
                    </div>
                    <!-- {/if} -->
                </div>
            </div>
        </Portal>
    {/if}
</div>
