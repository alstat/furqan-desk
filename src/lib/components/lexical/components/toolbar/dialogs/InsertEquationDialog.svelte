<script lang="ts">
    import { getCommands } from '$lexical/core/commands.js';
    import { getEditor, getActiveEditor } from '$lexical/core/composerContext.js';
    import { tick } from 'svelte';
    import { INSERT_EQUATION_COMMAND } from '$lexical/core/plugins/Equation/EquationPlugin.svelte';
    import Icon from '@iconify/svelte';
    import katex from 'katex';

    const editor = getEditor();
    const activeEditor = getActiveEditor();

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return { destroy() { node.remove(); } };
    }

    let showModal = $state(false);
    let equation = $state('');
    let mathStyle = $state('inline');
    let isDisabled = $derived(equation === '');
    let error = $state('');
    let previewEl = $state<HTMLElement | undefined>(undefined);

    export function open() {
        equation = '';
        mathStyle = 'inline';
        error = '';
        showModal = true;
    }

    async function close() {
        showModal = false;
        await tick();
        getCommands().FocusEditor.execute(editor);
    }

    function updatePreview() {
        if (!previewEl) return;
        if (!equation) { previewEl.innerHTML = ''; error = ''; return; }
        try {
            katex.render(equation, previewEl, {
                throwOnError: false,
                displayMode: mathStyle !== 'inline',
                output: 'mathml'
            });
            error = '';
        } catch (e) {
            error = e instanceof Error ? e.message : 'Invalid equation';
        }
    }

    $effect(() => {
        // re-run whenever equation or mathStyle changes and dialog is open
        if (showModal) updatePreview();
    });
</script>

{#if showModal}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        use:portal
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-brand-charcoal-900/40 backdrop-blur-sm"
        onclick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
        <div class="flex w-full max-w-sm flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">

            <!-- Header -->
            <div class="shrink-0 bg-brand-gold-100 border-b border-brand-gold-200 px-5 py-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gold-200">
                            <Icon icon="solar:calculator-bold-duotone" class="text-brand-gold-600" width="1rem" />
                        </div>
                        <h2 class="text-sm font-semibold text-brand-charcoal-900">Insert Equation</h2>
                    </div>
                    <button
                        onclick={close}
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 text-brand-gold-600 hover:bg-brand-gold-200/80 transition-colors"
                    >
                        <Icon icon="solar:close-circle-bold" width="1rem" />
                    </button>
                </div>
            </div>

            <!-- Body -->
            <div class="px-5 py-4 bg-brand-sand-50 flex flex-col gap-3">
                <div class="flex flex-col gap-1.5">
                    <label class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300">LaTeX Equation</label>
                    <textarea
                        placeholder="e.g. x^2 + y^2 = z^2"
                        rows="3"
                        bind:value={equation}
                        oninput={() => updatePreview()}
                        data-test-id="equation-modal-input"
                        class="w-full resize-none rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3 py-2.5 text-xs text-brand-charcoal-900 placeholder-brand-charcoal-300 focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                    ></textarea>
                </div>

                <!-- Preview -->
                <div class="rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3 py-2.5 min-h-[2.5rem] flex items-center justify-center">
                    <div bind:this={previewEl} class="text-brand-charcoal-900 text-sm"></div>
                    {#if !equation}
                        <span class="text-xs text-brand-charcoal-300">Preview will appear here</span>
                    {/if}
                </div>

                {#if error}
                    <p class="flex items-center gap-1 text-xs text-red-500">
                        <Icon icon="solar:danger-circle-bold" width="0.75rem" />{error}
                    </p>
                {/if}

                <div class="flex items-center gap-2">
                    <select
                        bind:value={mathStyle}
                        onchange={() => updatePreview()}
                        class="rounded-xl border border-brand-sand-200 bg-brand-sand-100 px-3 py-2 text-xs text-brand-charcoal-900 focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                    >
                        <option value="inline">Inline</option>
                        <option value="display">Display</option>
                    </select>
                    <button
                        data-test-id="equation-modal-confirm-btn"
                        disabled={isDisabled}
                        onclick={() => {
                            $activeEditor.dispatchCommand(INSERT_EQUATION_COMMAND, {
                                equation,
                                inline: mathStyle === 'inline'
                            });
                            close();
                        }}
                        class="cursor-pointer flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-gold-400 py-2 text-xs font-semibold text-white hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
                    >
                        <Icon icon="solar:calculator-bold" width="0.8rem" />
                        Insert Equation
                    </button>
                </div>
            </div>

        </div>
    </div>
{/if}
