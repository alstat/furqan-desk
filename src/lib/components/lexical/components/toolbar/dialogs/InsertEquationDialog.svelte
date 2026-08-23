<script lang="ts">
    import { getCommands } from "$lexical/core/commands.js";
    import {
        getEditor,
        getActiveEditor,
    } from "$lexical/core/composerContext.js";
    import { tick, onDestroy } from "svelte";
    import { fly } from "svelte/transition";
    import { INSERT_EQUATION_COMMAND } from "$lexical/core/plugins/Equation/EquationPlugin.svelte";
    import Icon from "@iconify/svelte";
    import katex from "katex";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import { headerHeight } from '$lib/stores/header.store';
    import DialogPanelHeader from "$lib/components/shared/DialogPanelHeader.svelte";
    import { t } from "$lib/i18n";
    import { get } from "svelte/store";
    import { icons } from "$lib/data/toolbar/toolbar";
    import { isPro } from "$lib/stores/auth.store";
    import AiSelectionToolbar from "$lib/components/shared/AiSelectionToolbar.svelte";

    const editor = getEditor();
    const activeEditor = getActiveEditor();

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

    let showModal = $state(false);
    let equation = $state("");
    let mathStyle = $state("inline");
    let isDisabled = $derived(equation === "");
    let error = $state("");
    let previewEl = $state<HTMLElement | undefined>(undefined);
    let textareaEl = $state<HTMLTextAreaElement | null>(null);

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
    // so the textarea itself is the anchor.
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
        equation =
            equation.slice(0, start) + replacement + equation.slice(end);
        aiSelection = null;
        const caret = start + replacement.length;
        tick().then(() => {
            textareaEl?.focus();
            textareaEl?.setSelectionRange(caret, caret);
        });
    }

    export function open() {
        equation = "";
        mathStyle = "inline";
        error = "";
        aiSelection = null;
        showModal = true;
    }

    async function close() {
        showModal = false;
        aiSelection = null;
        await tick();
        getCommands().FocusEditor.execute(editor);
    }

    function updatePreview() {
        if (!previewEl) return;
        if (!equation) {
            previewEl.innerHTML = "";
            error = "";
            return;
        }
        try {
            katex.render(equation, previewEl, {
                throwOnError: false,
                displayMode: mathStyle !== "inline",
                output: "mathml",
            });
            error = "";
        } catch (e) {
            error =
                e instanceof Error
                    ? e.message
                    : get(t)("dialog.invalid_equation");
        }
    }

    $effect(() => {
        // re-run whenever equation or mathStyle changes and dialog is open
        if (showModal) updatePreview();
    });

    // ── Sheet placement ─────────────────────────────────────────────────────
    const PANEL_W = 384; // matches max-w-sm


    let zIndex = $state(500);
    let initialized = false;

    // The sheet hangs off the header, so only its stacking needs setting.
    $effect(() => {
        if (showModal && !initialized) {
            zIndex = bringToFront();
            initialized = true;
        }
        if (!showModal) initialized = false;
    });

</script>

{#if showModal}
    <!-- Backdrop: a click anywhere outside dismisses the sheet, which
         no longer has a close button of its own. Transparent — this is
         a panel hanging off the header, not a modal over the page. -->
    <div
        use:portal
        role="presentation"
        class="fixed inset-0"
        style="z-index:{zIndex - 1};"
        onclick={close}
        onkeydown={() => {}}
    ></div>

    <div
        use:portal
        transition:fly={{ y: -10, duration: 180, opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={$t("dialog.insert_equation")}
        tabindex="-1"
        class="fixed flex flex-col -translate-x-1/2 rounded-b-xl border border-t-0 border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-[0_14px_28px_-10px_rgba(0,0,0,0.28)] dark:shadow-[0_14px_28px_-10px_rgba(0,0,0,0.55)] overflow-hidden"
        style="left:50%; top:{$headerHeight}px; width:{PANEL_W}px; z-index:{zIndex};"
        onpointerdown={() => {
            zIndex = bringToFront();
        }}
        onkeydown={(e) => {
            if (e.key === "Escape") {
                if (aiSelection) {
                    aiSelection = null;
                    return;
                }
                close();
            }
        }}
    >
        <!-- Header -->
        <DialogPanelHeader
            icon={icons["math"]}
            title={$t("dialog.insert_equation")}
            isDragging={false}
            hideClose={true}
            sheet={true}
            onClose={close}
            onpointerdown={() => {}}
        />

        <!-- Body -->
        <div
            class="px-5 py-5 bg-brand-sand-50 dark:bg-[#232634] flex flex-col gap-3"
        >
            <div class="flex flex-col gap-1.5">
                <label
                    for="equation-input"
                    class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                    >{$t("dialog.latex_equation")}</label
                >
                <textarea
                    id="equation-input"
                    placeholder={$t("dialog.equation_placeholder")}
                    rows="3"
                    bind:this={textareaEl}
                    bind:value={equation}
                    oninput={() => {
                        updatePreview();
                        updateAiSelection();
                    }}
                    onselect={updateAiSelection}
                    onkeyup={updateAiSelection}
                    onmouseup={updateAiSelection}
                    data-test-id="equation-modal-input"
                    class="w-full resize-none rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                ></textarea>
            </div>

            <!-- Preview -->
            <div
                class="rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 min-h-10 flex items-center justify-center"
            >
                <div
                    bind:this={previewEl}
                    class="text-brand-charcoal-900 dark:text-[#c6d0f5] text-sm"
                ></div>
                {#if !equation}
                    <span
                        class="text-[11px] text-brand-charcoal-300 dark:text-[#626880]"
                        >{$t("dialog.preview_placeholder")}</span
                    >
                {/if}
            </div>

            {#if error}
                <p class="flex items-center gap-1 text-[11px] text-red-500">
                    <Icon
                        icon="solar:danger-circle-bold"
                        width="0.75rem"
                    />{error}
                </p>
            {/if}

            <div class="flex items-center gap-3 justify-between">
                <div class="relative">
                    <select
                        bind:value={mathStyle}
                        onchange={() => updatePreview()}
                        class="appearance-none cursor-pointer rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#1e2030] px-3 py-1.5 pr-8 text-xs text-brand-charcoal-500 dark:text-[#c6d0f5] transition-all focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 hover:border-brand-sand-400 hover:bg-brand-sand-100 dark:hover:bg-[#1e2030]"
                    >
                        <option class="cursor-pointer" value="inline"
                            >{$t("dialog.math_inline")}</option
                        >
                        <option class="cursor-pointer" value="display"
                            >{$t("dialog.math_display")}</option
                        >
                    </select>
                    <span
                        class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300 dark:text-[#626880]"
                    >
                        <Icon icon="charm:chevron-down" width="0.75rem" />
                    </span>
                </div>
                <div></div>
                <button
                    data-test-id="equation-modal-confirm-btn"
                    disabled={isDisabled}
                    onclick={() => {
                        $activeEditor.dispatchCommand(INSERT_EQUATION_COMMAND, {
                            equation,
                            inline: mathStyle === "inline",
                        });
                        equation = "";
                        error = "";
                    }}
                    class="cursor-pointer flex px-5 items-center justify-center gap-1.5 rounded-full bg-brand-gold-400 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
                >
                    <Icon icon={icons["math"]} width="0.8rem" />
                    {$t("dialog.insert_equation")}
                </button>
            </div>
        </div>

        {#if $isPro && aiSelection}
            <AiSelectionToolbar
                selectedText={aiSelection.text}
                x={aiSelection.x}
                y={aiSelection.y}
                contextPrompt={`This text is a selection from a LaTeX equation (rendered with KaTeX). Keep the result as valid LaTeX. Full equation source:\n\n${equation}`}
                onReplace={replaceAiSelection}
                onClose={() => (aiSelection = null)}
            />
        {/if}
    </div>
{/if}
