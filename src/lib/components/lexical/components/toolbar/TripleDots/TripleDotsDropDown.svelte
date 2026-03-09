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
    let buttonRect: DOMRect | null = $state(null);
    let portalContent: HTMLElement | null = $state(null);
    const activeEditor = getActiveEditor();
    const editor = getEditor();
    const lineHeight = getContext<Readable<string>>("lineHeight");

    $effect(() => {
        windowWidth; // reactive dependency — runs whenever windowWidth changes
        if (isOpen && dropdownRef) {
            buttonRect = dropdownRef.getBoundingClientRect();
        }
    });

    // Create a higher z-index for nested portals
    // This will be injected into the document head
    let zIndexStyle: HTMLStyleElement | null = $state(null);

    function toggleDropdown() {
        if (!isOpen) {
            // Capture button position when opening
            buttonRect = dropdownRef.getBoundingClientRect();
        }
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
        onclick={toggleDropdown}
        class={"p-1 " + toolBarBtnStyle + (isOpen ? " " + activeBtnStyle : "")}
        aria-label="More options"
    >
        <Icon icon={icons["tripleDots"]} height="1rem" />
    </button>

    {#if isOpen && buttonRect}
        <Portal>
            <div
                class="portal-dropdown-content fixed z-10 rounded-md border border-slate-200 bg-slate-100 bg-opacity-80 shadow-2xl backdrop-blur-sm"
                style="top: {buttonRect.bottom +
                    14 +
                    (typeof window !== 'undefined'
                        ? window.scrollY
                        : 0)}px; left: {Math.max(
                    0,
                    buttonRect.right -
                        192 +
                        (typeof window !== 'undefined' ? window.scrollX : 0),
                )}px; width: 12rem;"
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
                        <hr class="my-1 border-gray-200" />
                    {/if}

                    <!-- XL breakpoint items (show when width < xl) -->
                    <!-- {#if windowWidth < 1380} -->
                    <div class="">
                        <div class="mb-2 px-2 py-1">
                            <span class="text-sm font-medium text-gray-700"
                                >Insert</span
                            >
                            <div class="mt-1 flex flex-col space-y-1">
                                <button
                                    class="cursor-pointer px-2 py-1 text-left text-sm rounded-lg hover:bg-slate-300 hover:text-slate-700 active:bg-slate-200"
                                    onclick={onInsertImageClick}
                                >
                                    <div
                                        class="flex w-32 flex-row items-center"
                                    >
                                        <div class="pr-2">
                                            <Icon
                                                icon={icons["image"]}
                                                width="1rem"
                                            />
                                        </div>
                                        <div>Image</div>
                                    </div>
                                </button>
                                <button
                                    class="cursor-pointer px-2 py-1 text-left text-sm rounded-lg hover:bg-slate-300 hover:text-slate-700 active:bg-slate-200"
                                    onclick={() => {
                                        $activeEditor.dispatchCommand(
                                            INSERT_HORIZONTAL_RULE_COMMAND,
                                            undefined,
                                        );
                                    }}
                                >
                                    <div
                                        class="flex w-32 flex-row items-center"
                                    >
                                        <div class="pr-2">
                                            <Icon
                                                icon={icons["hr"]}
                                                width="1rem"
                                            />
                                        </div>
                                        <div>Horizontal Rule</div>
                                    </div>
                                </button>
                                <button
                                    class="cursor-pointer px-2 py-1 text-left text-sm rounded-lg hover:bg-slate-300 hover:text-slate-700 active:bg-slate-200"
                                    onclick={onInsertEquationClick}
                                >
                                    <div
                                        class="flex w-32 flex-row items-center"
                                    >
                                        <div class="pr-2">
                                            <Icon
                                                icon={icons["math"]}
                                                width="1rem"
                                            />
                                        </div>
                                        <div>Equation</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                        <hr class="my-1 border-gray-200" />
                        <div class="flex items-center px-2 py-1">
                            <DropDownAlign />
                            {#if windowWidth < 768}
                                <FontSizeDropDown />
                            {/if}
                            <Indent />
                            <Outdent />
                        </div>
                        <hr class="my-1 border-gray-200" />
                        <div class="px-2 py-1">
                            <span class="text-sm font-medium text-gray-700"
                                >Line Spacing</span
                            >
                            <div class="mt-1 flex flex-col space-y-1">
                                {#each [{ label: "Single", value: "1" }, { label: "1.5 Lines", value: "1.5" }, { label: "Double", value: "2" }] as spacing}
                                    <button
                                        class="cursor-pointer px-2 py-1 text-left text-sm rounded-lg hover:bg-slate-300 hover:text-slate-700 active:bg-slate-200 {$lineHeight ===
                                        spacing.value
                                            ? 'bg-slate-300 text-slate-900 font-semibold'
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
