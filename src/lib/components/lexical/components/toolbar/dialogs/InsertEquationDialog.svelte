<script lang="ts">
    import { getCommands } from "$lexical/core/commands.js";
    import {
        getEditor,
        getActiveEditor,
    } from "$lexical/core/composerContext.js";
    import { tick, onDestroy } from "svelte";
    import { INSERT_EQUATION_COMMAND } from "$lexical/core/plugins/Equation/EquationPlugin.svelte";
    import Icon from "@iconify/svelte";
    import katex from "katex";
    import { bringToFront } from '$lib/stores/window-manager.store';

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
            error = e instanceof Error ? e.message : "Invalid equation";
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
    let dragStartX = 0, dragStartY = 0, startX = 0, startY = 0;
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
        window.addEventListener('pointermove', onDrag);
        window.addEventListener('pointerup', stopDrag, { once: true });
    }

    function onDrag(e: PointerEvent) {
        x = Math.max(0, Math.min(window.innerWidth - PANEL_W, startX + (e.clientX - dragStartX)));
        y = Math.max(0, Math.min(window.innerHeight - 60, startY + (e.clientY - dragStartY)));
    }

    function stopDrag() {
        isDragging = false;
        window.removeEventListener('pointermove', onDrag);
    }

    onDestroy(() => {
        if (typeof window !== 'undefined') window.removeEventListener('pointermove', onDrag);
    });
</script>

{#if showModal}
    <div
        use:portal
        role="dialog"
        aria-modal="true"
        aria-label="Insert Equation"
        tabindex="-1"
        class="fixed flex flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
        style="left:{x}px; top:{y}px; width:{PANEL_W}px; z-index:{zIndex};"
        onpointerdown={() => { zIndex = bringToFront(); }}
        onkeydown={(e) => { if (e.key === 'Escape') close(); }}
    >
            <!-- Header -->
            <div
                class="shrink-0 bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-5 py-4 select-none {isDragging ? 'cursor-grabbing' : 'cursor-grab'}"
                onpointerdown={startDrag}
                role="banner"
            >
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <div
                            class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gold-200 dark:bg-[#414559]"
                        >
                            <Icon
                                icon="solar:calculator-bold-duotone"
                                class="text-brand-gold-600"
                                width="1rem"
                            />
                        </div>
                        <h2
                            class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                        >
                            Insert Equation
                        </h2>
                    </div>
                    <button
                        onclick={close}
                        aria-label="Close"
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    >
                        <Icon
                            icon="solar:close-circle-bold-duotone"
                            width="1rem"
                        />
                    </button>
                </div>
            </div>

            <!-- Body -->
            <div
                class="px-5 pt-5 pb-6 bg-brand-sand-50 dark:bg-[#232634] flex flex-col gap-3"
            >
                <div class="flex flex-col gap-1.5">
                    <label
                        for="equation-input"
                        class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                        >LaTeX Equation</label
                    >
                    <textarea
                        id="equation-input"
                        placeholder="e.g. x^2 + y^2 = z^2"
                        rows="3"
                        bind:value={equation}
                        oninput={() => updatePreview()}
                        data-test-id="equation-modal-input"
                        class="w-full resize-none rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                    ></textarea>
                </div>

                <!-- Preview -->
                <div
                    class="rounded-xl mb-3 border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 min-h-10 flex items-center justify-center"
                >
                    <div
                        bind:this={previewEl}
                        class="text-brand-charcoal-900 dark:text-[#c6d0f5] text-sm"
                    ></div>
                    {#if !equation}
                        <span
                            class="text-[11px] text-brand-charcoal-300 dark:text-[#626880]"
                            >Preview will appear here</span
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
                    <select
                        bind:value={mathStyle}
                        onchange={() => updatePreview()}
                        class="h-7 cursor-pointer rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                    >
                        <option class="cursor-pointer" value="inline"
                            >Inline</option
                        >
                        <option class="cursor-pointer" value="display"
                            >Display</option
                        >
                    </select>
                    <div></div>
                    <button
                        data-test-id="equation-modal-confirm-btn"
                        disabled={isDisabled}
                        onclick={() => {
                            $activeEditor.dispatchCommand(
                                INSERT_EQUATION_COMMAND,
                                {
                                    equation,
                                    inline: mathStyle === "inline",
                                },
                            );
                            equation = "";
                            error = "";
                        }}
                        class="cursor-pointer flex px-5 items-center justify-center gap-1.5 rounded-full bg-brand-gold-400 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
                    >
                        <Icon icon="solar:calculator-bold" width="0.8rem" />
                        Insert Equation
                    </button>
                </div>
            </div>
    </div>
{/if}
