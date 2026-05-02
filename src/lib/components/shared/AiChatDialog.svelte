<script lang="ts">
    import Icon from "@iconify/svelte";
    import { fly } from "svelte/transition";
    import { tick } from "svelte";
    import { t } from "$lib/i18n";
    import {
        messages,
        streaming,
        sendMessage,
        clearMessages,
        type ChatMessage,
    } from "$lib/stores/ai-chat.store";
    import { renderMarkdown } from "$lib/utils/markdown";
    import { copyToClipboard } from "$lib/utils/clipboard";

    interface Props {
        open: boolean;
        onClose: () => void;
    }

    let { open, onClose }: Props = $props();

    let input = $state("");
    let scrollEl = $state<HTMLDivElement | null>(null);
    let copiedIdx = $state<number | null>(null);

    $effect(() => {
        // Re-scroll on each message update while open.
        if (!open) return;
        const _ = $messages.length;
        const lastLen = $messages[$messages.length - 1]?.content.length ?? 0;
        void _;
        void lastLen;
        tick().then(() => {
            if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
        });
    });

    async function handleSend() {
        const text = input.trim();
        if (!text || $streaming) return;
        input = "";
        await sendMessage(text);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    async function handleCopy(idx: number, content: string) {
        const ok = await copyToClipboard(content);
        if (ok) {
            copiedIdx = idx;
            setTimeout(() => {
                if (copiedIdx === idx) copiedIdx = null;
            }, 1400);
        }
    }

    function handleClose() {
        onClose();
    }
</script>

{#if open}
    <div
        role="dialog"
        aria-modal="true"
        aria-label={$t("ai_chat.title")}
        tabindex="-1"
        class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-brand-charcoal-900/30 backdrop-blur-sm"
        onclick={(e) => {
            if (e.target === e.currentTarget) handleClose();
        }}
        onkeydown={(e) => {
            if (e.key === "Escape") handleClose();
        }}
    >
        <div
            transition:fly={{ y: 8, duration: 180, opacity: 0 }}
            class="flex w-full max-w-2xl flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
            style="height: 85vh;"
        >
            <!-- Header -->
            <div
                class="shrink-0 bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-5 py-4"
            >
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <div
                            class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gold-200 dark:bg-[#414559]"
                        >
                            <Icon
                                icon="ri:chat-ai-3-fill"
                                class="text-brand-gold-500 dark:text-[#e5c890]"
                                width="1rem"
                            />
                        </div>
                        <div>
                            <h2
                                class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                            >
                                {$t("ai_chat.title")}
                            </h2>
                            <p
                                class="text-[11px] text-brand-charcoal-300 dark:text-[#8087a2]"
                            >
                                {$t("ai_chat.subtitle")}
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5">
                        {#if $messages.length > 0}
                            <button
                                onclick={clearMessages}
                                disabled={$streaming}
                                aria-label={$t("ai_chat.clear")}
                                title={$t("ai_chat.clear")}
                                class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Icon
                                    icon="solar:trash-bin-trash-bold-duotone"
                                    width="1rem"
                                />
                            </button>
                        {/if}
                        <button
                            onclick={handleClose}
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
            </div>

            <!-- Messages -->
            <div
                bind:this={scrollEl}
                class="flex-1 overflow-y-auto bg-brand-sand-50 dark:bg-[#232634] px-5 py-5 flex flex-col gap-3"
            >
                {#if $messages.length === 0}
                    <div
                        class="flex flex-1 flex-col items-center justify-center gap-2 text-center text-brand-charcoal-300 dark:text-[#626880]"
                    >
                        <Icon
                            icon="ri:chat-ai-3-fill"
                            width="2rem"
                            class="opacity-50"
                        />
                        <p class="text-[12px]">{$t("ai_chat.empty")}</p>
                    </div>
                {/if}

                {#each $messages as msg, i (i)}
                    {@const isUser = msg.role === "user"}
                    <div
                        class="flex {isUser
                            ? 'justify-end'
                            : 'justify-start'} group"
                    >
                        <div
                            class="relative max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed {isUser
                                ? 'bg-brand-gold-400 dark:bg-brand-gold-500 text-gray-100 dark:text-gray-700'
                                : 'bg-white dark:bg-[#292c3c] text-brand-charcoal-900 dark:text-[#c6d0f5] border border-brand-sand-200 dark:border-[#414559]'}"
                        >
                            {#if isUser}
                                <p class="whitespace-pre-wrap">{msg.content}</p>
                            {:else if msg.content === "" && $streaming && i === $messages.length - 1}
                                <span
                                    class="flex items-center gap-1.5 text-[11px] text-brand-charcoal-300 dark:text-[#8087a2]"
                                >
                                    <Icon
                                        icon="solar:refresh-circle-bold-duotone"
                                        class="animate-spin"
                                        width="0.85rem"
                                    />
                                    {$t("ai_chat.thinking")}
                                </span>
                            {:else}
                                <div class="markdown-body">
                                    {@html renderMarkdown(msg.content)}
                                </div>
                                {#if msg.content && !( $streaming && i === $messages.length - 1)}
                                    <button
                                        onclick={() =>
                                            handleCopy(i, msg.content)}
                                        aria-label={$t("ai_chat.copy")}
                                        title={$t("ai_chat.copy")}
                                        class="cursor-pointer absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] shadow-sm opacity-0 group-hover:opacity-100 hover:bg-brand-gold-300 dark:hover:bg-[#51576d] transition-all"
                                    >
                                        {#if copiedIdx === i}
                                            <Icon
                                                icon="solar:check-circle-bold"
                                                width="0.8rem"
                                            />
                                        {:else}
                                            <Icon
                                                icon="solar:copy-bold-duotone"
                                                width="0.8rem"
                                            />
                                        {/if}
                                    </button>
                                {/if}
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>

            <!-- Input -->
            <div
                class="shrink-0 bg-brand-sand-50 dark:bg-[#232634] border-t border-brand-sand-200 dark:border-[#414559] px-5 py-3"
            >
                <div
                    class="flex items-end gap-2 rounded-2xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2 focus-within:border-brand-gold-400 focus-within:ring-2 focus-within:ring-brand-gold-100 dark:focus-within:ring-brand-gold-900/30 transition-colors"
                >
                    <textarea
                        bind:value={input}
                        onkeydown={handleKeydown}
                        rows="1"
                        placeholder={$t("ai_chat.placeholder")}
                        disabled={$streaming}
                        class="flex-1 max-h-40 resize-none bg-transparent text-[12px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:outline-none disabled:opacity-50"
                    ></textarea>
                    <button
                        onclick={handleSend}
                        disabled={$streaming || !input.trim()}
                        aria-label={$t("ai_chat.send")}
                        title={$t("ai_chat.send")}
                        class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {#if $streaming}
                            <Icon
                                icon="solar:refresh-circle-bold-duotone"
                                class="animate-spin"
                                width="0.9rem"
                            />
                        {:else}
                            <Icon
                                icon="solar:plain-bold-duotone"
                                width="0.9rem"
                            />
                        {/if}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    :global(.markdown-body) {
        font-size: 13px;
        line-height: 1.55;
    }
    :global(.markdown-body p) {
        margin: 0.4em 0;
    }
    :global(.markdown-body p:first-child) {
        margin-top: 0;
    }
    :global(.markdown-body p:last-child) {
        margin-bottom: 0;
    }
    :global(.markdown-body ul),
    :global(.markdown-body ol) {
        margin: 0.4em 0;
        padding-left: 1.4em;
    }
    :global(.markdown-body li) {
        margin: 0.2em 0;
    }
    :global(.markdown-body code) {
        font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.88em;
        padding: 0.1em 0.35em;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.06);
    }
    :global(.dark .markdown-body code) {
        background: rgba(255, 255, 255, 0.08);
    }
    :global(.markdown-body pre) {
        margin: 0.6em 0;
        padding: 0.7em 0.9em;
        border-radius: 8px;
        background: #1e2030;
        color: #c6d0f5;
        overflow-x: auto;
        font-size: 12px;
    }
    :global(.markdown-body pre code) {
        background: transparent;
        padding: 0;
        font-size: inherit;
    }
    :global(.markdown-body h1),
    :global(.markdown-body h2),
    :global(.markdown-body h3) {
        font-weight: 600;
        margin: 0.6em 0 0.3em;
    }
    :global(.markdown-body h1) {
        font-size: 1.15em;
    }
    :global(.markdown-body h2) {
        font-size: 1.08em;
    }
    :global(.markdown-body h3) {
        font-size: 1em;
    }
    :global(.markdown-body a) {
        color: #c8a45e;
        text-decoration: underline;
    }
    :global(.markdown-body blockquote) {
        margin: 0.5em 0;
        padding-left: 0.8em;
        border-left: 3px solid rgba(200, 164, 94, 0.5);
        color: inherit;
        opacity: 0.85;
    }
    :global(.markdown-body table) {
        border-collapse: collapse;
        margin: 0.5em 0;
    }
    :global(.markdown-body th),
    :global(.markdown-body td) {
        border: 1px solid rgba(150, 150, 150, 0.3);
        padding: 0.3em 0.55em;
    }
</style>
