<script lang="ts">
    import { getEditor } from "$lexical/core/composerContext.js";
    import {
        $isReferenceListNode as isReferenceListNode,
        type ReferenceListNode,
    } from "./ReferenceListNode";
    import { $getNodeByKey as getNodeByKey } from "lexical";
    import { createNodeSelectionStore } from "../../nodeSelectionStore.js";
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import { references } from "$lib/stores/references.store";
    import {
        type Reference,
        type BibStyle,
        BIBLIOGRAPHY_STYLES,
        formatBibliographyEntry,
        isNumberedBibStyle,
    } from "$lib/utils/references";

    interface Props {
        refIds: string[];
        style: BibStyle;
        nodeKey: string;
    }

    let { refIds, style, nodeKey }: Props = $props();

    const editor = getEditor();

    // Highlights the section when it falls within the current editor selection
    // (Cmd/Ctrl+A or an explicit node selection), mirroring the equation node.
    const isSelected = createNodeSelectionStore(editor, nodeKey);

    let isEditing = $state(false);

    // Resolve the cited ids to live references, preserving citation order and
    // dropping any that were removed from the library.
    const entries = $derived.by<Reference[]>(() => {
        const byId = new Map($references.map((r) => [r.id, r]));
        return refIds.map((id) => byId.get(id)).filter((r): r is Reference => !!r);
    });

    const numbered = $derived(isNumberedBibStyle(style));
    const styleLabel = $derived(
        BIBLIOGRAPHY_STYLES.find((s) => s.id === style)?.label ?? style,
    );

    function handleDoubleClick() {
        isEditing = true;
    }

    function pickStyle(next: BibStyle) {
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (node && isReferenceListNode(node as ReferenceListNode)) {
                (node as ReferenceListNode).setStyle(next);
            }
        });
        isEditing = false;
    }

    function handleCancel() {
        isEditing = false;
    }
</script>

{#if isEditing}
    <!-- Style-picker card (mirrors the equation editor's double-click UI) -->
    <div class="my-3 w-72">
        <div
            class="flex flex-col rounded-3xl border border-brand-gold-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-lg overflow-hidden"
        >
            <!-- Editor header -->
            <div
                class="flex items-center justify-between bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-3 py-2"
            >
                <div class="flex items-center gap-1.5">
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
                        >{$t("editor.reference_list.choose_style")}</span
                    >
                </div>
                <!-- Cancel -->
                <button
                    onclick={handleCancel}
                    title="{$t('common.cancel')} (Esc)"
                    aria-label={$t("common.cancel")}
                    class="cursor-pointer flex h-5 w-5 items-center justify-center rounded-lg
                           bg-brand-gold-200 dark:bg-[#414559]
                           text-brand-gold-600 dark:text-[#c6d0f5]
                           hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                >
                    <Icon icon="solar:close-circle-bold-duotone" width="0.8rem" />
                </button>
            </div>

            <!-- Style options -->
            <div
                class="flex flex-col gap-1 px-3 pt-2.5 pb-2 bg-brand-sand-50 dark:bg-[#232634]"
            >
                {#each BIBLIOGRAPHY_STYLES as s (s.id)}
                    <button
                        onclick={() => pickStyle(s.id)}
                        class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors {s.id ===
                        style
                            ? 'bg-brand-gold-200 dark:bg-[#414559]'
                            : 'bg-brand-sand-100 dark:bg-[#1e2030] hover:bg-brand-gold-100 dark:hover:bg-[#292c3c]'}"
                    >
                        <span
                            class="text-[11px] font-sans text-brand-charcoal-900 dark:text-[#c6d0f5]"
                            >{s.label}</span
                        >
                        {#if s.id === style}
                            <Icon
                                icon="solar:check-circle-bold"
                                width="0.85rem"
                                class="text-brand-gold-600"
                            />
                        {/if}
                    </button>
                {/each}
            </div>
        </div>
    </div>
{:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="SL_Theme__reference_list my-4 cursor-pointer rounded-lg px-2 py-1 hover:bg-brand-gold-50 hover:outline hover:outline-1 hover:outline-brand-gold-300 transition-colors"
        class:reference-selected={$isSelected}
        ondblclick={handleDoubleClick}
        title={$t("editor.reference_list.dblclick_hint")}
    >
        <!-- Section header -->
        <div
            class="mb-2 flex items-center justify-between border-b border-brand-sand-200 pb-1 dark:border-[#414559]"
        >
            <span
                class="text-[15px] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
            >
                {$t("editor.reference_list.title")}
            </span>
            <span
                class="flex items-center gap-1 text-[9px] uppercase tracking-wide text-brand-charcoal-300 dark:text-[#626880]"
            >
                <Icon icon="fluent:text-quote-16-filled" width="0.7rem" />
                {styleLabel}
            </span>
        </div>

        {#if entries.length === 0}
            <p
                class="py-1 text-[12px] italic text-brand-charcoal-300 dark:text-[#626880]"
            >
                {$t("editor.reference_list.empty")}
            </p>
        {:else}
            <ol class="flex flex-col gap-1.5">
                {#each entries as ref, i (ref.id)}
                    <li
                        class="flex gap-2 text-[13px] leading-snug text-brand-charcoal-900 dark:text-[#c6d0f5]"
                    >
                        {#if numbered}
                            <span
                                class="shrink-0 font-mono text-brand-charcoal-300 dark:text-[#838ba7]"
                                >[{i + 1}]</span
                            >
                        {/if}
                        <span class="min-w-0">
                            {formatBibliographyEntry(ref, style)}
                        </span>
                    </li>
                {/each}
            </ol>
        {/if}
    </div>
{/if}

<style>
    /* Mirrors the equation node's selection highlight. */
    .reference-selected {
        background-color: rgba(99, 130, 233, 0.15);
        outline: 2px solid rgba(99, 130, 233, 0.45);
    }
</style>
