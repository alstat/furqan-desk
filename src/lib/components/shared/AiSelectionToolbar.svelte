<script lang="ts">
    import Icon from "@iconify/svelte";
    import {
        runAiTextTransform,
        type AiTextAction,
        type AiTextTone,
    } from "$lib/stores/ai-text-transform.store";
    import { askAiAboutSelection } from "$lib/stores/ai-chat.store";
    import { onMount, tick } from "svelte";
    import { t } from "$lib/i18n";

    interface Props {
        selectedText: string;
        x: number;
        y: number;
        contextPrompt?: string;
        askAiContextPrompt?: string;
        onReplace?: (replacement: string) => void;
        onClose?: () => void;
        askOnly?: boolean;
        /** Source language of the selection (e.g. "julia", "typst"); when set,
         *  code transforms annotate their edits with brief inline comments. */
        language?: string;
    }

    let {
        selectedText,
        x,
        y,
        contextPrompt,
        askAiContextPrompt,
        onReplace,
        onClose,
        askOnly = false,
        language,
    }: Props = $props();

    let promptOpen = $state(false);
    let askPromptOpen = $state(false);
    let promptText = $state("");
    let askPromptText = $state("");
    let promptInput: HTMLInputElement | null = $state(null);
    let askPromptInput: HTMLInputElement | null = $state(null);
    let busyAction = $state<AiTextAction | null>(null);
    let toneMenuAction = $state<Exclude<AiTextAction, "prompt"> | null>(null);
    let error = $state("");
    let toolbarEl: HTMLDivElement | null = $state(null);
    let toolbarPosition = $state({ left: 0, top: 0 });
    let positionReady = $state(false);
    let positionFrame: number | null = null;

    const VIEWPORT_MARGIN = 8;
    const BELOW_OFFSET = 32;

    function updatePosition() {
        positionFrame = null;
        if (!toolbarEl) return;

        const width = toolbarEl.offsetWidth;
        const height = toolbarEl.offsetHeight;
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;
        const minLeft = VIEWPORT_MARGIN + width / 2;
        const maxLeft = viewportWidth - VIEWPORT_MARGIN - width / 2;
        const left =
            minLeft <= maxLeft
                ? Math.max(minLeft, Math.min(maxLeft, x))
                : viewportWidth / 2;

        const aboveTop = y - height;
        const belowTop = y + BELOW_OFFSET;
        const maxTop = Math.max(
            VIEWPORT_MARGIN,
            viewportHeight - VIEWPORT_MARGIN - height,
        );
        const preferredTop =
            aboveTop >= VIEWPORT_MARGIN
                ? aboveTop
                : belowTop + height <= viewportHeight - VIEWPORT_MARGIN
                  ? belowTop
                  : aboveTop;
        const top = Math.max(
            VIEWPORT_MARGIN,
            Math.min(maxTop, preferredTop),
        );

        if (
            toolbarPosition.left !== left ||
            toolbarPosition.top !== top
        ) {
            toolbarPosition = { left, top };
        }
        positionReady = true;
    }

    function schedulePositionUpdate() {
        if (positionFrame === null) {
            positionFrame = requestAnimationFrame(updatePosition);
        }
    }

    $effect(() => {
        x;
        y;
        toolbarEl;
        schedulePositionUpdate();
    });

    onMount(() => {
        const observer =
            toolbarEl && typeof ResizeObserver !== "undefined"
                ? new ResizeObserver(schedulePositionUpdate)
                : null;
        if (toolbarEl) observer?.observe(toolbarEl);
        window.addEventListener("resize", schedulePositionUpdate);
        schedulePositionUpdate();

        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", schedulePositionUpdate);
            if (positionFrame !== null) cancelAnimationFrame(positionFrame);
        };
    });

    const actions: Array<{
        id: Exclude<AiTextAction, "prompt">;
        labelKey: string;
        icon: string;
    }> = [
        {
            id: "paraphrase",
            labelKey: "ai_selection.paraphrase",
            icon: "dashicons:update",
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

    const tones: Array<{ id: AiTextTone; labelKey: string }> = [
        { id: "academic", labelKey: "ai_selection.tone_academic" },
        { id: "casual", labelKey: "ai_selection.tone_casual" },
        { id: "persuasive", labelKey: "ai_selection.tone_persuasive" },
        { id: "bold", labelKey: "ai_selection.tone_bold" },
        { id: "friendly", labelKey: "ai_selection.tone_friendly" },
    ];

    async function run(
        action: AiTextAction,
        customPrompt?: string,
        tone?: AiTextTone,
    ) {
        if (busyAction) return;
        busyAction = action;
        error = "";
        try {
            const replacement = await runAiTextTransform({
                action,
                selectedText,
                customPrompt,
                contextPrompt,
                tone,
                language,
            });
            onReplace?.(replacement);
            onClose?.();
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            busyAction = null;
        }
    }

    function handleActionClick(id: Exclude<AiTextAction, "prompt">) {
        if (busyAction) return;
        if (toneMenuAction === id) {
            // Second click on the same action: run it plain, as before.
            toneMenuAction = null;
            run(id);
            return;
        }
        toneMenuAction = id;
        promptOpen = false;
        askPromptOpen = false;
    }

    function runWithTone(tone: AiTextTone) {
        if (!toneMenuAction) return;
        const action = toneMenuAction;
        toneMenuAction = null;
        run(action, undefined, tone);
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
        askAiAboutSelection({
            prompt,
            selectedText,
            contextPrompt: askAiContextPrompt ?? contextPrompt,
        });
        onClose?.();
    }

    async function togglePrompt() {
        promptOpen = !promptOpen;
        if (promptOpen) {
            askPromptOpen = false;
            toneMenuAction = null;
        }
        if (!promptOpen) return;

        await tick();
        promptInput?.focus();
    }

    async function toggleAskPrompt() {
        askPromptOpen = !askPromptOpen;
        if (askPromptOpen) {
            promptOpen = false;
            toneMenuAction = null;
        }
        if (!askPromptOpen) return;

        await tick();
        askPromptInput?.focus();
    }
</script>

<div
    bind:this={toolbarEl}
    data-ai-selection-toolbar
    role="presentation"
    class="essential-ai-selection-toolbar fixed z-9999 flex max-w-[calc(100vw-1rem)] flex-col items-center gap-2 font-sans"
    style="left:{toolbarPosition.left}px; top:{toolbarPosition.top}px; transform: translateX(-50%); visibility:{positionReady ? 'visible' : 'hidden'};"
    onpointerdown={handlePointerDown}
>
    <div class="flex max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-2">
        {#if !askOnly}
            {#each actions as action (action.id)}
                <button
                    class="group relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full p-0 shadow-md transition-colors text-brand-gold-600 hover:bg-brand-gold-400 active:bg-brand-gold-500 focus:outline-none focus:ring-2 focus:ring-brand-gold-300 dark:text-brand-gold-400 dark:hover:bg-[#4a4e5c] dark:active:bg-[#414559] disabled:cursor-wait disabled:opacity-50 {toneMenuAction ===
                    action.id
                        ? 'bg-brand-gold-400 dark:bg-[#4a4e5c]'
                        : 'bg-brand-gold-200 dark:bg-[#363a4f]'}"
                    disabled={busyAction !== null}
                    onclick={() => handleActionClick(action.id)}
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
                        class="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-brand-charcoal-900 px-2 py-1 text-[0.625rem] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-[#1e2030] dark:text-[#c6d0f5]"
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
                    class="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-brand-charcoal-900 px-2 py-1 text-[0.625rem] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-[#1e2030] dark:text-[#c6d0f5]"
                >
                    {$t("ai_selection.prompt")}
                </span>
            </button>
        {/if}
        <button
            class="group relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-brand-gold-200 p-0 shadow-md transition-colors text-brand-gold-600 hover:bg-brand-gold-400 active:bg-brand-gold-500 focus:outline-none focus:ring-2 focus:ring-brand-gold-300 dark:bg-[#363a4f] dark:text-brand-gold-400 dark:hover:bg-[#4a4e5c] dark:active:bg-[#414559] disabled:opacity-50"
            disabled={busyAction !== null}
            onclick={toggleAskPrompt}
            aria-label={$t("ai_selection.ask_ai")}
        >
            <Icon icon="ri:chat-smile-ai-fill" width="1rem" />
            <span
                class="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-brand-charcoal-900 px-2 py-1 text-[0.625rem] font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-[#1e2030] dark:text-[#c6d0f5]"
            >
                {$t("ai_selection.ask_ai")}
            </span>
        </button>
    </div>

    {#if toneMenuAction && !askOnly}
        <div
            class="flex max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-1 rounded-xl border border-brand-sand-200 bg-white/95 p-1 shadow-xl backdrop-blur-sm dark:border-[#414559] dark:bg-[#363a4f]/95 dark:shadow-black/40"
        >
            {#each tones as tone (tone.id)}
                <button
                    class="cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1 text-[0.6875rem] font-medium text-brand-charcoal-700 transition-colors hover:bg-brand-gold-200 hover:text-brand-gold-600 focus:outline-none focus:ring-2 focus:ring-brand-gold-300 dark:text-[#c6d0f5] dark:hover:bg-[#4a4e5c] dark:hover:text-brand-gold-400 disabled:cursor-wait disabled:opacity-50"
                    disabled={busyAction !== null}
                    onclick={() => runWithTone(tone.id)}
                >
                    {$t(tone.labelKey)}
                </button>
            {/each}
        </div>
    {/if}

    {#if promptOpen}
        <div
            class="relative flex w-80 max-w-[calc(100vw-1rem)] items-center gap-1.5 rounded-xl border border-brand-sand-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-sm dark:border-[#414559] dark:bg-[#363a4f]/95 dark:shadow-black/40"
        >
            {#if busyAction === "prompt"}
                <span class="prompt-runborder" aria-hidden="true"></span>
            {/if}
            <input
                bind:this={promptInput}
                bind:value={promptText}
                placeholder={$t("ai_selection.prompt_placeholder")}
                class="min-w-0 flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#1e2030] px-2.5 py-1.5 text-[0.6875rem] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20"
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
            class="flex w-80 max-w-[calc(100vw-1rem)] items-center gap-1.5 rounded-xl border border-brand-sand-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-sm dark:border-[#414559] dark:bg-[#363a4f]/95 dark:shadow-black/40"
        >
            <input
                bind:this={askPromptInput}
                bind:value={askPromptText}
                placeholder={$t("ai_selection.ask_placeholder")}
                class="min-w-0 flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#1e2030] px-2.5 py-1.5 text-[0.6875rem] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20"
                onkeydown={(e) => {
                    if (e.key === "Enter") submitAskPrompt();
                    if (e.key === "Escape") askPromptOpen = false;
                }}
            />
            <button
                class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 text-gray-100 dark:text-gray-700 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 hover:dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                disabled={!askPromptText.trim() || busyAction !== null}
                onclick={submitAskPrompt}
                title={$t("ai_selection.ask_ai")}
            >
                <Icon icon="solar:plain-bold-duotone" width="0.85rem" />
            </button>
        </div>
    {/if}

    {#if error}
        <div
            class="max-w-80 px-1 text-[0.625rem] leading-snug text-red-500 dark:text-red-400"
        >
            {error}
        </div>
    {/if}
</div>

<style>
    /* Animated gradient border that traces the prompt input container while
       the prompt action is running. Same brand-gold tones as
       .julia-cell-runbar in JuliaCellComponent — gold in light mode and a
       softened pastel mix in dark. A rotating conic-gradient is masked to
       only fill the ring (padding area), so the colour appears to travel
       around the rounded rectangle border. */
    @property --runborder-angle {
        syntax: "<angle>";
        inherits: false;
        initial-value: 0deg;
    }

    .prompt-runborder {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        padding: 1.5px;
        pointer-events: none;
        background: conic-gradient(
            from var(--runborder-angle),
            transparent 0deg,
            var(--color-brand-gold-400) 60deg,
            var(--color-brand-gold-500) 90deg,
            var(--color-brand-gold-400) 120deg,
            transparent 180deg,
            transparent 360deg
        );
        -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
        mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
        mask-composite: exclude;
        animation: prompt-runborder-spin 1.4s linear infinite;
    }

    :global(.dark) .prompt-runborder {
        background: conic-gradient(
            from var(--runborder-angle),
            transparent 0deg,
            #8caaee 60deg,
            #e5c890 90deg,
            #8caaee 120deg,
            transparent 180deg,
            transparent 360deg
        );
    }

    @keyframes prompt-runborder-spin {
        to {
            --runborder-angle: 360deg;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .prompt-runborder {
            animation: none;
        }
    }
</style>
