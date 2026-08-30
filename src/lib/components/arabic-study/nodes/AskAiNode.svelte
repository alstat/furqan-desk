<!-- Open-ended follow-up about the studied ayah — hands off to the AI Chat
     window with this ayah as context, same as Morphology View's per-word "Ask
     AI" popover. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import { isPro } from "$lib/stores/auth.store";
    import { askAiAboutSelection, AI_FEATURE_TAGS } from "$lib/stores/ai-chat.store";

    interface Props {
        arabic: string;
        contextPrompt: string;
    }
    let { arabic, contextPrompt }: Props = $props();

    let prompt = $state("");

    function submit() {
        const text = prompt.trim();
        if (!text) return;
        askAiAboutSelection({
            prompt: text,
            selectedText: arabic,
            contextPrompt,
            feature: AI_FEATURE_TAGS.arabicStudyAsk,
        });
        prompt = "";
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    }
</script>

<div
    class="rounded-2xl border border-dashed border-brand-gold-300 bg-white p-3.5 dark:border-[#9c8b70] dark:bg-[#292c3c]"
>
    <div class="mb-2 flex items-center gap-2">
        <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-gold-100 text-brand-gold-600 dark:bg-[#414559] dark:text-[#e5c890]"
        >
            <Icon icon="ri:chat-smile-ai-fill" width="0.85rem" />
        </span>
        <h3 class="text-[0.71875rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
            {$t("arabicStudy.node.ask_ai")}
        </h3>
    </div>

    {#if !$isPro}
        <p class="py-2 text-[0.6875rem] text-brand-charcoal-300 dark:text-[#838ba7]">
            {$t("arabicStudy.node.grammar_pro")}
        </p>
    {:else}
        <div
            class="flex items-center gap-1.5 rounded-full border border-brand-sand-200 bg-brand-sand-100 py-1.5 pl-3.5 pr-1.5 focus-within:border-brand-gold-400 dark:border-[#414559] dark:bg-[#1e2030]"
        >
            <input
                type="text"
                bind:value={prompt}
                onkeydown={onKeydown}
                placeholder={$t("arabicStudy.node.ask_ai_placeholder")}
                class="min-w-0 flex-1 bg-transparent text-[0.6875rem] text-brand-charcoal-900 placeholder-brand-charcoal-300 outline-none dark:text-[#c6d0f5] dark:placeholder-[#626880]"
            />
            <button
                onclick={submit}
                disabled={!prompt.trim()}
                aria-label={$t("arabicStudy.node.ask_ai")}
                class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand-gold-400 text-gray-100 transition-colors hover:bg-brand-gold-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-gold-500 dark:text-gray-800"
            >
                <Icon icon="solar:arrow-right-linear" width="0.7rem" />
            </button>
        </div>
        <p class="mt-2 text-[0.625rem] leading-relaxed text-brand-charcoal-300 dark:text-[#838ba7]">
            {$t("arabicStudy.node.ask_ai_hint")}
        </p>
    {/if}
</div>
