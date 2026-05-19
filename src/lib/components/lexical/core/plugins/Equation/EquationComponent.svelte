<script lang="ts">
    import katex from "katex";
    // KaTeX's stylesheet + bundled fonts — required for the HTML renderer to
    // position accents (\bar, \hat, \overline, vectors) without overlap.
    import "katex/dist/katex.min.css";
    import { onMount } from "svelte";
    import { getEditor } from "$lexical/core/composerContext.js";
    import { $isEquationNode as isEquationNode } from "./EquationNode";
    import { $getNodeByKey as getNodeByKey } from "lexical";
    import { createNodeSelectionStore } from "../../nodeSelectionStore.js";
    import Icon from "@iconify/svelte";
    import { icons } from "$lib/data/toolbar/toolbar";
    import { t } from "$lib/i18n";

    interface Props {
        equation: string;
        isInline: boolean;
        nodeKey: string;
        autoEdit?: boolean;
    }

    let { equation, isInline, nodeKey, autoEdit = false }: Props = $props();

    let element: HTMLElement | null = $state(null);
    let previewEl: HTMLElement | null = $state(null);
    let textareaEl: HTMLTextAreaElement | null = $state(null);
    let isEditing = $state(autoEdit);
    let editableValue = $state(equation);

    const editor = getEditor();

    // Tracks whether this equation falls within the current editor selection
    // (range selection via Cmd/Ctrl+A or an explicit node selection) so the
    // node gets a visible highlight like ordinary text.
    const isSelected = createNodeSelectionStore(editor, nodeKey);

    function renderEquation() {
        if (element) {
            katex.render(equation, element, {
                throwOnError: false,
                displayMode: !isInline,
                output: "htmlAndMathml",
            });
        }
    }

    function renderPreview() {
        if (previewEl && editableValue) {
            katex.render(editableValue, previewEl, {
                throwOnError: false,
                displayMode: !isInline,
                output: "htmlAndMathml",
            });
        } else if (previewEl) {
            previewEl.innerHTML = "";
        }
    }

    function handleDoubleClick() {
        isEditing = true;
        editableValue = equation;
    }

    function handleSave() {
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (node && isEquationNode(node)) {
                node.setEquation(editableValue);
            }
        });
        isEditing = false;
    }

    function handleCancel() {
        isEditing = false;
        editableValue = equation;
    }

    function handleKeydown(event: KeyboardEvent) {
        event.stopPropagation();
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSave();
        } else if (event.key === "Escape") {
            event.preventDefault();
            handleCancel();
        }
    }

    $effect(() => {
        if (!isEditing) renderEquation();
    });

    $effect(() => {
        if (isEditing) renderPreview();
    });

    // re-render preview whenever editableValue changes while editing
    $effect(() => {
        editableValue;
        if (isEditing) renderPreview();
    });

    onMount(() => {
        renderEquation();
        if (autoEdit) {
            editor.update(() => {
                const node = getNodeByKey(nodeKey);
                if (node && isEquationNode(node)) {
                    node.setAutoEdit(false);
                }
            });
            setTimeout(() => textareaEl?.focus(), 0);
        }
    });
</script>

{#if isEditing}
    <!-- Inline equation editor card -->
    <span class="inline-block my-1 w-72 align-middle">
        <span
            class="flex flex-col rounded-3xl border border-brand-gold-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-lg overflow-hidden"
        >
            <!-- Editor header -->
            <span
                class="flex items-center justify-between bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-3 py-2"
            >
                <span class="flex items-center gap-1.5">
                    <span
                        class="flex h-5 w-5 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559]"
                    >
                        <Icon
                            icon={icons["math"]}
                            class="text-brand-gold-600"
                            width="0.65rem"
                        />
                    </span>
                    <span
                        class="font-sans text-[11px] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                        >{$t('editor.equation.edit_title')}</span
                    >
                </span>
                <span class="flex items-center gap-0.5">
                    <!-- Save -->
                    <button
                        onclick={handleSave}
                        title="{$t('common.save')} (Enter)"
                        class="cursor-pointer flex items-center gap-1 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-3 py-0.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 font-sans active:bg-brand-gold-600/90 transition-colors"
                    >
                        {$t('common.save')}
                    </button>
                    <!-- Cancel -->
                    <button
                        onclick={handleCancel}
                        title="{$t('common.cancel')} (Esc)"
                        class="cursor-pointer text-brand-charcoal-300 dark:text-[#626880] hover:text-brand-charcoal-900/60 dark:hover:text-[#c6d0f5] transition-colors ml-3 mr-1"
                    >
                        <Icon icon="solar:close-circle-bold" width="0.8rem" />
                    </button>
                </span>
            </span>

            <!-- Textarea -->
            <span class="px-3 pt-2.5 pb-1.5 bg-brand-sand-50 dark:bg-[#232634]">
                <!-- svelte-ignore a11y_autofocus -->
                <textarea
                    bind:this={textareaEl}
                    bind:value={editableValue}
                    onkeydown={handleKeydown}
                    autofocus
                    autocorrect="off"
                    dir="ltr"
                    rows="2"
                    placeholder={$t('editor.equation.placeholder')}
                    class="w-full resize-none rounded-lg border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-2.5 py-2 font-mono text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                ></textarea>
            </span>

            <!-- Preview -->
            <span
                class="border-t border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#232634] px-3 py-2 flex items-center justify-center min-h-8"
            >
                {#if editableValue}
                    <span
                        bind:this={previewEl}
                        class="text-brand-charcoal-900 dark:text-[#c6d0f5] text-sm"
                    ></span>
                {:else}
                    <span
                        class="text-[10px] text-brand-charcoal-300 dark:text-[#626880]"
                        >{$t('editor.equation.preview_placeholder')}</span
                    >
                {/if}
            </span>
        </span>
    </span>
{:else if isInline}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span
        class="SL_Theme__equation_inline cursor-pointer rounded px-0.5 hover:bg-brand-gold-100 hover:outline hover:outline-1 hover:outline-brand-gold-300 transition-colors"
        class:equation-selected={$isSelected}
        bind:this={element}
        ondblclick={handleDoubleClick}
        title={$t('editor.dblclick_hint')}
    ></span>
{:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="SL_Theme__equation_display cursor-pointer rounded-lg px-2 py-1 hover:bg-brand-gold-50 hover:outline hover:outline-1 hover:outline-brand-gold-300 transition-colors"
        class:equation-selected={$isSelected}
        bind:this={element}
        ondblclick={handleDoubleClick}
        title={$t('editor.dblclick_hint')}
    ></div>
{/if}

<style>
    /* Mirrors the browser's native text-selection highlight so users get
       clear feedback that an equation is part of the current selection. */
    .equation-selected {
        background-color: rgba(99, 130, 233, 0.35);
        outline: 2px solid rgba(99, 130, 233, 0.55);
    }
</style>
