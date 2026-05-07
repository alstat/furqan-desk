<script lang="ts">
    import Icon from "@iconify/svelte";
    import {
        runAiTextTransform,
        type AiTextAction,
    } from "$lib/stores/ai-text-transform.store";
    import { askAiAboutSelection } from "$lib/stores/ai-chat.store";
    import { tick } from "svelte";
    import { t } from "$lib/i18n";

    interface Props {
        selectedText: string;
        x: number;
        y: number;
        contextPrompt?: string;
        onReplace: (replacement: string) => void;
        onClose?: () => void;
    }

    let { selectedText, x, y, contextPrompt, onReplace, onClose }: Props =
        $props();

    let promptOpen = $state(false);
    let askPromptOpen = $state(false);
    let promptText = $state("");
    let askPromptText = $state("");
    let promptInput: HTMLInputElement | null = $state(null);
    let askPromptInput: HTMLInputElement | null = $state(null);
    let busyAction = $state<AiTextAction | null>(null);
    let error = $state("");

    const actions: Array<{
        id: Exclude<AiTextAction, "prompt">;
        labelKey: string;
        icon: string;
    }> = [
        {
            id: "paraphrase",
            labelKey: "ai_selection.paraphrase",
            icon: "solar:pen-new-square-bold-duotone",
        },
        {
            id: "elaborate",
            labelKey: "ai_selection.elaborate",
            icon: "solar:maximize-square-3-bold-duotone",
        },
        {
            id: "shorten",
            labelKey: "ai_selection.shorten",
            icon: "solar:minimize-square-3-bold-duotone",
        },
    ];

    async function run(action: AiTextAction, customPrompt?: string) {
        if (busyAction) return;
        busyAction = action;
        error = "";
        try {
            const replacement = await runAiTextTransform({
                action,
                selectedText,
                customPrompt,
                contextPrompt,
            });
            onReplace(replacement);
            onClose?.();
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            busyAction = null;
        }
    }

    function handlePointerDown(e: PointerEvent) {
        if (!(e.target as HTMLElement).closest("input, textarea")) {
            e.preventDefault();
        }
        e.stopPropagation();
    }

    function submitPrompt() {
        const prompt = promptText.trim();
        if (!prompt) return;
        run("prompt", prompt);
    }

    function submitAskPrompt() {
        const prompt = askPromptText.trim();
        if (!prompt || busyAction) return;
        askAiAboutSelection({ prompt, selectedText, contextPrompt });
        onClose?.();
    }

    async function togglePrompt() {
        promptOpen = !promptOpen;
        if (promptOpen) askPromptOpen = false;
        if (!promptOpen) return;

        await tick();
        promptInput?.focus();
    }

    async function toggleAskPrompt() {
        askPromptOpen = !askPromptOpen;
        if (askPromptOpen) promptOpen = false;
        if (!askPromptOpen) return;

        await tick();
        askPromptInput?.focus();
    }
</script>

<div
    data-ai-selection-toolbar
    role="presentation"
    class="fixed z-9999 flex flex-col items-center gap-2"
    style="left:{x}px; top:{y}px; transform: translate(-50%, -100%);"
    onpointerdown={handlePointerDown}
>
    <div class="flex items-center gap-2">
        {#each actions as action (action.id)}
            <button
                class="group relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-brand-gold-200 p-0 shadow-md transition-colors text-brand-gold-600 hover:bg-brand-gold-400 active:bg-brand-gold-500 focus:outline-none focus:ring-2 focus:ring-brand-gold-300 dark:bg-[#363a4f] dark:text-brand-gold-400 dark:hover:bg-[#4a4e5c] dark:active:bg-[#414559] disabled:cursor-wait disabled:opacity-50"
                disabled={busyAction !== null}
                onclick={() => run(action.id)}
                aria-label={$t(action.labelKey)}
            >
                <Icon
                    icon={busyAction === action.id
                        ? "solar:refresh-circle-bold-duotone"
                        : action.icon}
                    class={busyAction === action.id ? "animate-spin" : ""}
                    width="1rem"
                />
                <span
                    class="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-brand-charcoal-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-[#1e2030] dark:text-[#c6d0f5]"
                >
                    {$t(action.labelKey)}
                </span>
            </button>
        {/each}
        <button
            class="group relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-brand-gold-200 p-0 shadow-md transition-colors text-brand-gold-600 hover:bg-brand-gold-400 active:bg-brand-gold-500 focus:outline-none focus:ring-2 focus:ring-brand-gold-300 dark:bg-[#363a4f] dark:text-brand-gold-400 dark:hover:bg-[#4a4e5c] dark:active:bg-[#414559] disabled:opacity-50"
            disabled={busyAction !== null}
            onclick={togglePrompt}
            aria-label={$t("ai_selection.prompt")}
        >
            <Icon
                icon={busyAction === "prompt"
                    ? "solar:refresh-circle-bold-duotone"
                    : "solar:magic-stick-3-bold-duotone"}
                class={busyAction === "prompt" ? "animate-spin" : ""}
                width="1rem"
            />
            <span
                class="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-brand-charcoal-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-[#1e2030] dark:text-[#c6d0f5]"
            >
                {$t("ai_selection.prompt")}
            </span>
        </button>
        <button
            class="group relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-brand-gold-200 p-0 shadow-md transition-colors text-brand-gold-600 hover:bg-brand-gold-400 active:bg-brand-gold-500 focus:outline-none focus:ring-2 focus:ring-brand-gold-300 dark:bg-[#363a4f] dark:text-brand-gold-400 dark:hover:bg-[#4a4e5c] dark:active:bg-[#414559] disabled:opacity-50"
            disabled={busyAction !== null}
            onclick={toggleAskPrompt}
            aria-label="Ask AI"
        >
            <Icon icon="ri:chat-ai-3-fill" width="1rem" />
            <span
                class="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-brand-charcoal-900 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-[#1e2030] dark:text-[#c6d0f5]"
            >
                Ask AI
            </span>
        </button>
    </div>

    {#if promptOpen}
        <div
            class="flex w-80 items-center gap-1.5 rounded-2xl border border-brand-sand-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-sm dark:border-[#414559] dark:bg-[#363a4f]/95 dark:shadow-black/40"
        >
            <input
                bind:this={promptInput}
                bind:value={promptText}
                placeholder={$t("ai_selection.prompt_placeholder")}
                class="min-w-0 flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#1e2030] px-2.5 py-1.5 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-brand-gold-900/30"
                onkeydown={(e) => {
                    if (e.key === "Enter") submitPrompt();
                    if (e.key === "Escape") promptOpen = false;
                }}
            />
            <button
                class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 text-gray-100 dark:text-gray-700 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 hover:dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                disabled={!promptText.trim() || busyAction !== null}
                onclick={submitPrompt}
                title={$t("ai_selection.run_prompt")}
            >
                <Icon icon="solar:plain-bold-duotone" width="0.85rem" />
            </button>
        </div>
    {/if}

    {#if askPromptOpen}
        <div
            class="flex w-80 items-center gap-1.5 rounded-2xl border border-brand-sand-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-sm dark:border-[#414559] dark:bg-[#363a4f]/95 dark:shadow-black/40"
        >
            <input
                bind:this={askPromptInput}
                bind:value={askPromptText}
                placeholder="Ask AI about this selection..."
                class="min-w-0 flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#1e2030] px-2.5 py-1.5 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-brand-gold-900/30"
                onkeydown={(e) => {
                    if (e.key === "Enter") submitAskPrompt();
                    if (e.key === "Escape") askPromptOpen = false;
                }}
            />
            <button
                class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 text-gray-100 dark:text-gray-700 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 hover:dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                disabled={!askPromptText.trim() || busyAction !== null}
                onclick={submitAskPrompt}
                title="Ask AI"
            >
                <Icon icon="solar:plain-bold-duotone" width="0.85rem" />
            </button>
        </div>
    {/if}

    {#if error}
        <div
            class="max-w-80 px-1 text-[10px] leading-snug text-red-500 dark:text-red-400"
        >
            {error}
        </div>
    {/if}
</div>
