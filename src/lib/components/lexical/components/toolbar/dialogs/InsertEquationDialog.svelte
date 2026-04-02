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
    import DialogPanelHeader from "$lib/components/shared/DialogPanelHeader.svelte";
    import { t } from '$lib/i18n';
    import { get } from 'svelte/store';

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

    export function open() {
        equation = "";
        mathStyle = "inline";
        error = "";
        showModal = true;
    }

    async function close() {
        showModal = false;
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
            error = e instanceof Error ? e.message : get(t)('dialog.invalid_equation');
        }
    }

    $effect(() => {
        // re-run whenever equation or mathStyle changes and dialog is open
        if (showModal) updatePreview();
    });

    // ── Drag ────────────────────────────────────────────────────────────────
    const PANEL_W = 384; // matches max-w-sm

    let x = $state(0);
    let y = $state(0);
    let zIndex = $state(500);
    let isDragging = $state(false);
    let dragStartX = 0,
        dragStartY = 0,
        startX = 0,
        startY = 0;
    let initialized = false;

    $effect(() => {
        if (showModal && !initialized) {
            x = Math.max(0, (window.innerWidth - PANEL_W) / 2);
            y = Math.max(8, (window.innerHeight - 380) * 0.25);
            zIndex = bringToFront();
            initialized = true;
        }
        if (!showModal) initialized = false;
    });

    function startDrag(e: PointerEvent) {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startX = x;
        startY = y;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", stopDrag, { once: true });
    }

    function onDrag(e: PointerEvent) {
        x = Math.max(
            0,
            Math.min(
                window.innerWidth - PANEL_W,
                startX + (e.clientX - dragStartX),
            ),
        );
        y = Math.max(
            0,
            Math.min(
                window.innerHeight - 60,
                startY + (e.clientY - dragStartY),
            ),
        );
    }

    function stopDrag() {
        isDragging = false;
        window.removeEventListener("pointermove", onDrag);
    }

    onDestroy(() => {
        if (typeof window !== "undefined")
            window.removeEventListener("pointermove", onDrag);
    });
</script>

{#if showModal}
    <div
        use:portal
        transition:fly={{ y: 8, duration: 180, opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={$t('dialog.insert_equation')}
        tabindex="-1"
        class="fixed flex flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
        style="left:{x}px; top:{y}px; width:{PANEL_W}px; z-index:{zIndex};"
        onpointerdown={() => {
            zIndex = bringToFront();
        }}
        onkeydown={(e) => {
            if (e.key === "Escape") close();
        }}
    >
        <!-- Header -->
        <DialogPanelHeader
            icon="solar:calculator-bold-duotone"
            title={$t('dialog.insert_equation')}
            {isDragging}
            onClose={close}
            onpointerdown={startDrag}
        />

        <!-- Body -->
        <div
            class="px-5 py-5 bg-brand-sand-50 dark:bg-[#232634] flex flex-col gap-3"
        >
            <div class="flex flex-col gap-1.5">
                <label
                    for="equation-input"
                    class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                    >{$t('dialog.latex_equation')}</label
                >
                <textarea
                    id="equation-input"
                    placeholder={$t('dialog.equation_placeholder')}
                    rows="3"
                    bind:value={equation}
                    oninput={() => updatePreview()}
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
                        >{$t('dialog.preview_placeholder')}</span
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
                            >{$t('dialog.math_inline')}</option
                        >
                        <option class="cursor-pointer" value="display"
                            >{$t('dialog.math_display')}</option
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
                    <Icon icon="solar:calculator-bold" width="0.8rem" />
                    {$t('dialog.insert_equation')}
                </button>
            </div>
        </div>
    </div>
{/if}
