<script lang="ts">
    import katex from "katex";
    // KaTeX's stylesheet + bundled fonts — required for the HTML renderer to
    // position accents (\bar, \hat, \overline, vectors) without overlap.
    import "katex/dist/katex.min.css";
    import { onMount, tick } from "svelte";
    import { getEditor } from "$lexical/core/composerContext.js";
    import { $isEquationNode as isEquationNode } from "./EquationNode";
    import {
        equationFontScale,
        EQUATION_FONT_SCALE_DEFAULT,
        EQUATION_FONT_SCALE_MIN,
        EQUATION_FONT_SCALE_MAX,
        EQUATION_FONT_SCALE_STEP,
    } from "$lib/stores/equation.store";
    import { $getNodeByKey as getNodeByKey } from "lexical";
    import { createNodeSelectionStore } from "../../nodeSelectionStore.js";
    import Icon from "@iconify/svelte";
    import { icons } from "$lib/data/toolbar/toolbar";
    import { t } from "$lib/i18n";
    import { isPro } from "$lib/stores/auth.store";
    import AiSelectionToolbar from "$lib/components/shared/AiSelectionToolbar.svelte";

    interface Props {
        equation: string;
        isInline: boolean;
        nodeKey: string;
        autoEdit?: boolean;
    }

    let { equation, isInline, nodeKey, autoEdit = false }: Props = $props();

    // App-wide, persisted — see equation.store.ts. Every equation in every open
    // document reads the same value, so the size control below resizes them all.
    const fontScale = $derived($equationFontScale);

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

    // ── AI selection toolbar (pro users) ─────────────────────────────────────
    let aiSelection = $state<{
        start: number;
        end: number;
        text: string;
        x: number;
        y: number;
    } | null>(null);

    // Anchor the floating toolbar above the LaTeX textarea whenever it holds
    // a non-empty selection. Textareas don't expose per-character coordinates,
    // so the editor card itself is the anchor.
    function updateAiSelection() {
        if (!$isPro || !textareaEl) {
            aiSelection = null;
            return;
        }
        const start = textareaEl.selectionStart ?? 0;
        const end = textareaEl.selectionEnd ?? 0;
        if (start === end) {
            aiSelection = null;
            return;
        }
        const text = textareaEl.value.slice(start, end);
        if (!text.trim()) {
            aiSelection = null;
            return;
        }
        const rect = textareaEl.getBoundingClientRect();
        const viewportWidth = window.innerWidth || 0;
        aiSelection = {
            start,
            end,
            text,
            x: Math.max(
                180,
                Math.min(viewportWidth - 180, rect.left + rect.width / 2),
            ),
            y: Math.max(12, rect.top - 8),
        };
    }

    function replaceAiSelection(replacement: string) {
        if (!aiSelection) return;
        const { start, end } = aiSelection;
        editableValue =
            editableValue.slice(0, start) +
            replacement +
            editableValue.slice(end);
        aiSelection = null;
        const caret = start + replacement.length;
        tick().then(() => {
            textareaEl?.focus();
            textareaEl?.setSelectionRange(caret, caret);
        });
    }

    // ── Equation size control ────────────────────────────────────────────────
    // Clicking an equation (inline or display) opens a size control, mirroring
    // the Quran block. The size is an app-wide preference, so the control
    // resizes every equation in every tab at once and the choice is remembered
    // for documents opened later. The popup is positioned fixed rather than
    // nested inside the equation: KaTeX owns that element's innerHTML, and a
    // wrapper would change how inline math sits in the surrounding text.
    let showControls = $state(false);
    let controlsEl = $state<HTMLElement | null>(null);
    let controlsX = $state(0);
    let controlsY = $state(0);
    let controlsBelow = $state(false);

    function positionControls() {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const vw = window.innerWidth || 0;
        controlsX = Math.max(70, Math.min(vw - 70, rect.left + rect.width / 2));
        // Flip below when the equation sits too close to the top to fit above.
        controlsBelow = rect.top < 48;
        controlsY = controlsBelow ? rect.bottom + 8 : rect.top - 8;
    }

    function handleClick() {
        // Deliberately no stopPropagation: Lexical keeps handling the click, so
        // selecting/deleting an equation behaves exactly as it did before.
        // onWindowClick below ignores clicks that land inside this equation.
        positionControls();
        showControls = true;
    }

    function onWindowClick(e: MouseEvent) {
        if (!showControls) return;
        const target = e.target as Node | null;
        if (!target) return;
        if (element?.contains(target) || controlsEl?.contains(target)) return;
        showControls = false;
    }

    // Keep the popup pinned to its equation while the document scrolls. Capture
    // phase, because the editor scrolls in a container, not the window.
    $effect(() => {
        if (!showControls) return;
        const reposition = () => positionControls();
        window.addEventListener("scroll", reposition, true);
        window.addEventListener("resize", reposition);
        return () => {
            window.removeEventListener("scroll", reposition, true);
            window.removeEventListener("resize", reposition);
        };
    });

    // Resizing moves the equation the popup is anchored to, so re-anchor once
    // the new size has been laid out.
    $effect(() => {
        void fontScale;
        if (!showControls) return;
        tick().then(positionControls);
    });

    // Writing to the store is enough: it clamps, persists, and every mounted
    // equation re-renders from it. Deliberately not an `editor.update` — the
    // size is a preference, not an edit, so it must not dirty the document.
    function setScale(next: number) {
        equationFontScale.set(next);
    }

    function increase(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setScale(+(fontScale + EQUATION_FONT_SCALE_STEP).toFixed(2));
    }
    function decrease(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setScale(+(fontScale - EQUATION_FONT_SCALE_STEP).toFixed(2));
    }
    function resetScale(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setScale(EQUATION_FONT_SCALE_DEFAULT);
    }

    function handleDoubleClick() {
        showControls = false;
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
        aiSelection = null;
    }

    function handleCancel() {
        isEditing = false;
        editableValue = equation;
        aiSelection = null;
    }

    function handleKeydown(event: KeyboardEvent) {
        event.stopPropagation();
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSave();
        } else if (event.key === "Escape") {
            event.preventDefault();
            if (aiSelection) {
                aiSelection = null;
                return;
            }
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

<svelte:window on:click={onWindowClick} />

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
                        >{$t("editor.equation.edit_title")}</span
                    >
                </span>
                <span class="flex items-center gap-0.5">
                    <!-- Save -->
                    <button
                        onclick={handleSave}
                        title="{$t('common.save')} (Enter)"
                        class="cursor-pointer flex items-center gap-1 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-3 py-0.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 font-sans active:bg-brand-gold-600/90 transition-colors"
                    >
                        {$t("common.save")}
                    </button>
                    <!-- Cancel -->
                    <button
                        onclick={handleCancel}
                        title="{$t('common.cancel')} (Esc)"
                        aria-label={$t("common.cancel")}
                        class="cursor-pointer flex h-5 w-5 items-center justify-center rounded-lg
                               bg-brand-gold-200 dark:bg-[#414559]
                               text-brand-gold-600 dark:text-[#c6d0f5]
                               hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors ml-2"
                    >
                        <Icon
                            icon="solar:close-circle-bold-duotone"
                            width="0.8rem"
                        />
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
                    onselect={updateAiSelection}
                    onkeyup={updateAiSelection}
                    onmouseup={updateAiSelection}
                    oninput={updateAiSelection}
                    autofocus
                    autocorrect="off"
                    dir="ltr"
                    rows="2"
                    placeholder={$t("editor.equation.placeholder")}
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
                        >{$t("editor.equation.preview_placeholder")}</span
                    >
                {/if}
            </span>
        </span>
    </span>
    {#if $isPro && aiSelection}
        <AiSelectionToolbar
            selectedText={aiSelection.text}
            x={aiSelection.x}
            y={aiSelection.y}
            contextPrompt={`This text is a selection from a LaTeX equation (rendered with KaTeX). Keep the result as valid LaTeX. Full equation source:\n\n${editableValue}`}
            onReplace={replaceAiSelection}
            onClose={() => (aiSelection = null)}
        />
    {/if}
{:else if isInline}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <span
        class="SL_Theme__equation_inline cursor-pointer rounded px-0.5 hover:bg-brand-gold-100 hover:outline hover:outline-1 hover:outline-brand-gold-300 transition-colors"
        class:equation-selected={$isSelected}
        bind:this={element}
        onclick={handleClick}
        ondblclick={handleDoubleClick}
        style:font-size="{fontScale}em"
        title={$t("editor.dblclick_hint")}
    ></span>
{:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
        class="cursor-pointer rounded-lg px-2 pt-1 hover:bg-brand-gold-50 hover:outline hover:outline-1 hover:outline-brand-gold-300 transition-colors"
        class:equation-selected={$isSelected}
        bind:this={element}
        onclick={handleClick}
        ondblclick={handleDoubleClick}
        style:font-size="{fontScale}em"
        title={$t("editor.dblclick_hint")}
    ></div>
{/if}

{#if showControls && !isEditing}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div
        bind:this={controlsEl}
        contenteditable="false"
        role="toolbar"
        aria-label="Equation font size"
        class="fixed z-[9999] flex items-center gap-0.5 rounded-full border border-brand-gold-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-md px-1 py-0.5"
        style="left:{controlsX}px; top:{controlsY}px; transform: translate(-50%, {controlsBelow
            ? '0'
            : '-100%'});"
        onclick={(e) => e.stopPropagation()}
    >
        <button
            type="button"
            onmousedown={(e) => e.preventDefault()}
            onclick={decrease}
            disabled={fontScale <= EQUATION_FONT_SCALE_MIN + 1e-6}
            title="Decrease equation font size (all equations)"
            aria-label="Decrease equation font size"
            class="cursor-pointer flex h-5 w-5 items-center justify-center rounded-full text-brand-gold-600 dark:text-[#e5c890] hover:bg-brand-gold-100 dark:hover:bg-[#414559] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
            <Icon icon="solar:minus-circle-linear" width="0.9rem" />
        </button>
        <button
            type="button"
            onmousedown={(e) => e.preventDefault()}
            onclick={resetScale}
            title="Reset equation font size (all equations)"
            aria-label="Reset equation font size"
            class="cursor-pointer min-w-[2.25rem] px-1 text-[10px] font-sans font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5] hover:text-brand-gold-600 dark:hover:text-[#e5c890] transition-colors"
        >
            {Math.round(fontScale * 100)}%
        </button>
        <button
            type="button"
            onmousedown={(e) => e.preventDefault()}
            onclick={increase}
            disabled={fontScale >= EQUATION_FONT_SCALE_MAX - 1e-6}
            title="Increase equation font size (all equations)"
            aria-label="Increase equation font size"
            class="cursor-pointer flex h-5 w-5 items-center justify-center rounded-full text-brand-gold-600 dark:text-[#e5c890] hover:bg-brand-gold-100 dark:hover:bg-[#414559] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
            <Icon icon="solar:add-circle-linear" width="0.9rem" />
        </button>
    </div>
{/if}

<style>
    /* Mirrors the browser's native text-selection highlight so users get
       clear feedback that an equation is part of the current selection. */
    .equation-selected {
        background-color: rgba(99, 130, 233, 0.35);
        outline: 2px solid rgba(99, 130, 233, 0.55);
    }
</style>
