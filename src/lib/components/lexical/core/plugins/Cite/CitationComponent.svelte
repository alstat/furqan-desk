<script lang="ts">
    import { tick } from "svelte";
    import Icon from "@iconify/svelte";
    import { getEditor } from "$lexical/core/composerContext.js";
    import { $isCitationNode as isCitationNode } from "./CitationNode";
    import { $getNodeByKey as getNodeByKey } from "lexical";
    import { createNodeSelectionStore } from "../../nodeSelectionStore.js";
    import { t } from "$lib/i18n";
    import { references } from "$lib/stores/references.store";
    import {
        type CitationStyle,
        citationStyles,
    } from "$lib/utils/references";

    interface Props {
        refId: string;
        styleId: string;
        text: string;
        nodeKey: string;
    }

    let { refId, styleId, text, nodeKey }: Props = $props();

    const editor = getEditor();

    // Highlights the citation when it falls within the current editor selection
    // (range selection via Cmd/Ctrl+A or an explicit node selection).
    const isSelected = createNodeSelectionStore(editor, nodeKey);

    let isEditing = $state(false);
    let editableText = $state(text);
    let editableStyleId = $state(styleId);
    let textInputEl = $state<HTMLInputElement | null>(null);

    // The reference this citation points to, if it still exists in the library.
    const ref = $derived($references.find((r) => r.id === refId) ?? null);

    // In-text style options for this reference (empty if the ref was removed).
    // `number` mirrors the reference's 1-based position in the library, the same
    // way the /cite menu computed it.
    const styleOptions = $derived.by<CitationStyle[]>(() => {
        if (!ref) return [];
        const number = $references.findIndex((r) => r.id === refId) + 1;
        return citationStyles(ref, number || 1);
    });

    async function handleDoubleClick() {
        editableText = text;
        editableStyleId = styleId;
        isEditing = true;
        await tick();
        textInputEl?.focus();
        textInputEl?.select();
    }

    function pickStyle(style: CitationStyle) {
        editableStyleId = style.id;
        editableText = style.text;
        textInputEl?.focus();
    }

    function handleSave() {
        const next = editableText.trim();
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (node && isCitationNode(node)) {
                // Keep the previous text if the field was cleared.
                node.setCitation(editableStyleId, next || text);
            }
        });
        isEditing = false;
        editor.focus();
    }

    function handleCancel() {
        editableText = text;
        editableStyleId = styleId;
        isEditing = false;
        editor.focus();
    }

    function handleKeydown(e: KeyboardEvent) {
        e.stopPropagation();
        if (e.key === "Enter") {
            e.preventDefault();
            handleSave();
        } else if (e.key === "Escape") {
            e.preventDefault();
            handleCancel();
        }
    }
</script>

{#if isEditing}
    <!-- Inline citation editor card (mirrors the equation editor's UI) -->
    <span class="inline-block my-1 w-64 align-middle">
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
                            icon="fluent:text-quote-16-filled"
                            class="text-brand-gold-600"
                            width="0.65rem"
                        />
                    </span>
                    <span
                        class="font-sans text-[11px] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                        >{$t("editor.citation.edit_title")}</span
                    >
                </span>
                <span class="flex items-center gap-0.5">
                    <button
                        onclick={handleSave}
                        title="{$t('common.save')} (Enter)"
                        class="cursor-pointer flex items-center gap-1 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-3 py-0.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 font-sans active:bg-brand-gold-600/90 transition-colors"
                    >
                        {$t("common.save")}
                    </button>
                    <button
                        onclick={handleCancel}
                        title="{$t('common.cancel')} (Esc)"
                        aria-label={$t("common.cancel")}
                        class="cursor-pointer flex h-5 w-5 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors ml-2"
                    >
                        <Icon
                            icon="solar:close-circle-bold-duotone"
                            width="0.8rem"
                        />
                    </button>
                </span>
            </span>

            <!-- Body: custom text + style presets -->
            <span
                class="flex flex-col gap-2 px-3 pt-2.5 pb-2.5 bg-brand-sand-50 dark:bg-[#232634]"
            >
                <!-- Editable citation text -->
                <span class="flex flex-col gap-1">
                    <span
                        class="text-[9px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#626880]"
                        >{$t("editor.citation.text_label")}</span
                    >
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                        bind:this={textInputEl}
                        bind:value={editableText}
                        oninput={() => (editableStyleId = "custom")}
                        onkeydown={handleKeydown}
                        spellcheck="false"
                        placeholder={$t("editor.citation.text_placeholder")}
                        class="w-full rounded-lg border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-2.5 py-1.5 text-[12px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20 transition-colors"
                    />
                </span>

                {#if styleOptions.length}
                    <span class="flex flex-col gap-1">
                        <span
                            class="text-[9px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#626880]"
                            >{$t("editor.citation.style_label")}</span
                        >
                        {#each styleOptions as style (style.id)}
                            <button
                                onclick={() => pickStyle(style)}
                                class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors {style.id ===
                                editableStyleId
                                    ? 'bg-brand-gold-200 dark:bg-[#414559]'
                                    : 'bg-brand-sand-100 dark:bg-[#1e2030] hover:bg-brand-gold-100 dark:hover:bg-[#292c3c]'}"
                            >
                                <span
                                    class="truncate text-[12px] text-brand-charcoal-900 dark:text-[#c6d0f5]"
                                    >{style.text}</span
                                >
                                <span
                                    class="shrink-0 text-[9px] uppercase tracking-wide text-brand-charcoal-300 dark:text-[#626880]"
                                    >{style.label}</span
                                >
                            </button>
                        {/each}
                    </span>
                {:else}
                    <span
                        class="text-[10px] italic text-brand-charcoal-300 dark:text-[#626880]"
                        >{$t("editor.citation.missing_ref")}</span
                    >
                {/if}
            </span>
        </span>
    </span>
{:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span
        class="SL_Theme__citation_inline cursor-pointer rounded px-0.5 text-brand-gold-700 dark:text-[#e5c890] hover:bg-brand-gold-100 hover:outline hover:outline-1 hover:outline-brand-gold-300 transition-colors dark:hover:bg-[#414559]"
        class:citation-selected={$isSelected}
        ondblclick={handleDoubleClick}
        title={$t("editor.citation.dblclick_hint")}
    >{text}</span>
{/if}

<style>
    /* Mirrors the equation node's selection highlight. */
    .citation-selected {
        background-color: rgba(99, 130, 233, 0.35);
        outline: 2px solid rgba(99, 130, 233, 0.55);
    }
</style>
