<script lang="ts">
    import { getActiveEditor } from "$lexical/core/composerContext.js";
    import { INSERT_CODE_COMMAND } from "$lexical/core/plugins/CodeHighlighter/CodePlugin.svelte";
    import { getCommands } from "$lexical/core/commands.js";
    import { tick, onDestroy } from "svelte";
    import { fly } from "svelte/transition";
    import Icon from "@iconify/svelte";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import { headerHeight } from '$lib/stores/header.store';
    import { csdMarginPx } from '$lib/stores/window-state.store';
    import DialogPanelHeader from "$lib/components/shared/DialogPanelHeader.svelte";
    import { t } from "$lib/i18n";
    import { isPro } from "$lib/stores/auth.store";
    import AiSelectionToolbar from "$lib/components/shared/AiSelectionToolbar.svelte";

    const activeEditor = getActiveEditor();

    interface Props {
        showModal?: boolean;
    }

    let { showModal = $bindable(false) }: Props = $props();

    let language = $state("javascript");
    let code = $state("");
    let textareaEl = $state<HTMLTextAreaElement | null>(null);

    // ── AI selection toolbar (pro users) ─────────────────────────────────────
    let aiSelection = $state<{
        start: number;
        end: number;
        text: string;
        x: number;
        y: number;
    } | null>(null);

    // Anchor the floating toolbar above the code textarea whenever it holds
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
        code = code.slice(0, start) + replacement + code.slice(end);
        aiSelection = null;
        const caret = start + replacement.length;
        tick().then(() => {
            textareaEl?.focus();
            textareaEl?.setSelectionRange(caret, caret);
        });
    }

    async function close() {
        showModal = false;
        aiSelection = null;
        await tick();
        getCommands().FocusEditor.execute($activeEditor);
    }

    function handleTabKey(e: KeyboardEvent) {
        if (e.key !== "Tab") return;
        e.preventDefault();
        const ta = e.currentTarget as HTMLTextAreaElement;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        code = code.substring(0, start) + "    " + code.substring(end);
        tick().then(() => {
            ta.selectionStart = ta.selectionEnd = start + 4;
        });
    }

    function onConfirm() {
        $activeEditor.dispatchCommand(INSERT_CODE_COMMAND, { code, language });
        code = "";
        aiSelection = null;
    }

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

    const languages = [
        "javascript",
        "typescript",
        "python",
        "julia",
        "r",
        "css",
        "html",
        "sql",
        "json",
        "yaml",
        "bash",
    ];

    // ── Sheet placement ─────────────────────────────────────────────────────
    const PANEL_W = 448; // matches max-w-md


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

    const selectClass =
        "w-full appearance-none cursor-pointer rounded-xl border border-brand-sand-200 bg-brand-sand-50/80 px-3 py-1.5 pr-8 text-xs text-brand-charcoal-500 transition-all focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 hover:border-brand-sand-400 hover:bg-brand-sand-100";
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
        aria-label={$t("dialog.insert_code")}
        tabindex="-1"
        class="fixed flex flex-col -translate-x-1/2 rounded-b-xl border border-t-0 border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-[0_14px_28px_-10px_rgba(0,0,0,0.28)] dark:shadow-[0_14px_28px_-10px_rgba(0,0,0,0.55)] overflow-hidden"
        style="left:50%; top:{$headerHeight + $csdMarginPx + 1}px; width:{PANEL_W}px; z-index:{zIndex};"
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
            icon="solar:code-square-bold-duotone"
            title={$t("dialog.insert_code")}
            isDragging={false}
            hideClose={true}
            sheet={true}
            onClose={close}
            onpointerdown={() => {}}
        />

        <!-- Body -->
        <div
            class="px-5 py-4 bg-brand-sand-50 dark:bg-[#232634] flex flex-col gap-3"
        >
            <!-- Language selector -->
            <div class="flex flex-col gap-1.5">
                <label
                    class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                    >{$t("dialog.insert_code.language")}</label
                >
                <div class="relative">
                    <select bind:value={language} class={selectClass}>
                        {#each languages as lang}
                            <option class="cursor-pointer" value={lang}
                                >{lang}</option
                            >
                        {/each}
                    </select>
                    <span
                        class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                    >
                        <Icon icon="charm:chevron-down" width="0.75rem" />
                    </span>
                </div>
            </div>

            <!-- Code textarea -->
            <div class="flex flex-col gap-1.5">
                <label
                    class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                    >{$t("dialog.insert_code.code")}</label
                >
                <textarea
                    bind:this={textareaEl}
                    bind:value={code}
                    onkeydown={handleTabKey}
                    onselect={updateAiSelection}
                    onkeyup={updateAiSelection}
                    onmouseup={updateAiSelection}
                    oninput={updateAiSelection}
                    autocorrect="off"
                    dir="ltr"
                    placeholder={$t("dialog.insert_code.placeholder")}
                    rows="8"
                    class="w-full resize-y rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors font-mono"
                ></textarea>
            </div>

            <!-- Action -->
            <button
                disabled={!code.trim()}
                onclick={onConfirm}
                class="cursor-pointer flex items-center justify-center gap-1.5 rounded-full bg-brand-gold-400 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
            >
                <Icon icon="solar:code-square-bold" width="0.8rem" />
                {$t("dialog.insert_code")}
            </button>
        </div>

        {#if $isPro && aiSelection}
            <AiSelectionToolbar
                selectedText={aiSelection.text}
                x={aiSelection.x}
                y={aiSelection.y}
                contextPrompt={`This text is a selection from a ${language} code snippet. Keep the result as valid ${language} code. Full snippet:\n\n${code}`}
                onReplace={replaceAiSelection}
                onClose={() => (aiSelection = null)}
            />
        {/if}
    </div>
{/if}
