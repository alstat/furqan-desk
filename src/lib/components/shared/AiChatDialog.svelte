<script lang="ts">
    import Icon from "@iconify/svelte";
    import { fly } from "svelte/transition";
    import { onDestroy, tick } from "svelte";
    import { t } from "$lib/i18n";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import {
        messages,
        streaming,
        currentChatId,
        chats,
        storageBytes,
        limits,
        quotaBlock,
        useAdvanced,
        sendMessage,
        stopStreaming,
        loadChat,
        deleteChat,
        newChat,
        refreshChats,
        refreshLimits,
    } from "$lib/stores/ai-chat.store";
    import { keyState, loadKeyState, lock } from "$lib/stores/chat-key.store";
    import { authUser } from "$lib/stores/auth.store";
    import { renderMarkdown } from "$lib/utils/markdown";
    import { copyToClipboard } from "$lib/utils/clipboard";
    import "katex/dist/katex.min.css";
    import ChatSidebar from "./ChatSidebar.svelte";
    import ChatLockScreen from "./ChatLockScreen.svelte";

    interface Props {
        open: boolean;
        onClose: () => void;
    }

    let { open, onClose }: Props = $props();

    let input = $state("");
    let scrollEl = $state<HTMLDivElement | null>(null);
    let copiedIdx = $state<number | null>(null);

    let panelW = $state(960);
    let panelH = $state(680);
    const MIN_W = 340;
    const MIN_H = 380;

    let x = $state(0);
    let y = $state(0);
    let zIndex = $state(500);
    let isDragging = $state(false);
    let dragStartX = 0;
    let dragStartY = 0;
    let startX = 0;
    let startY = 0;
    let initialized = false;

    type ResizeDir = { e: boolean; w: boolean; n: boolean; s: boolean };
    let resizeDir: ResizeDir = { e: false, w: false, n: false, s: false };
    let resizeStartX = 0;
    let resizeStartY = 0;
    let resizeStartW = 0;
    let resizeStartH = 0;
    let resizeStartPanelX = 0;
    let resizeStartPanelY = 0;

    // Sidebar visibility is controlled from the dialog header.
    let sidebarOpen = $state(true);

    $effect(() => {
        if (typeof window === "undefined") return;

        if (open && !initialized) {
            panelW = Math.min(panelW, Math.max(MIN_W, window.innerWidth - 16));
            panelH = Math.min(panelH, Math.max(MIN_H, window.innerHeight - 16));
            x = Math.max(0, (window.innerWidth - panelW) / 2);
            y = Math.max(0, (window.innerHeight - panelH) / 2);
            zIndex = bringToFront();
            initialized = true;
        }

        if (!open) initialized = false;
    });

    $effect(() => {
        if (!open || typeof window === "undefined") return;
        window.addEventListener("keydown", handleWindowKeydown);
        return () => window.removeEventListener("keydown", handleWindowKeydown);
    });

    function handleWindowKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") handleClose();
    }

    function startDrag(e: PointerEvent) {
        if ((e.target as HTMLElement).closest("button")) return;
        if (typeof window === "undefined") return;
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
                window.innerWidth - Math.min(panelW, window.innerWidth),
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

    function startResize(e: PointerEvent, dir: ResizeDir) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window === "undefined") return;
        resizeDir = dir;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeStartW = panelW;
        resizeStartH = panelH;
        resizeStartPanelX = x;
        resizeStartPanelY = y;
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", onResize);
        window.addEventListener("pointerup", stopResize, { once: true });
    }

    function onResize(e: PointerEvent) {
        const dx = e.clientX - resizeStartX;
        const dy = e.clientY - resizeStartY;
        let newW = resizeStartW;
        let newH = resizeStartH;
        let newX = resizeStartPanelX;
        let newY = resizeStartPanelY;
        const maxW = Math.max(MIN_W, window.innerWidth - 8);
        const maxH = Math.max(MIN_H, window.innerHeight - 8);

        if (resizeDir.e) {
            newW = Math.min(maxW, Math.max(MIN_W, resizeStartW + dx));
        }
        if (resizeDir.s) {
            newH = Math.min(maxH, Math.max(MIN_H, resizeStartH + dy));
        }
        if (resizeDir.w) {
            newW = Math.min(maxW, Math.max(MIN_W, resizeStartW - dx));
            newX = resizeStartPanelX + (resizeStartW - newW);
        }
        if (resizeDir.n) {
            newH = Math.min(maxH, Math.max(MIN_H, resizeStartH - dy));
            newY = resizeStartPanelY + (resizeStartH - newH);
        }

        panelW = newW;
        panelH = newH;
        x = Math.max(
            0,
            Math.min(
                window.innerWidth - Math.min(panelW, window.innerWidth),
                newX,
            ),
        );
        y = Math.max(0, Math.min(window.innerHeight - 60, newY));
    }

    function stopResize() {
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onResize);
    }

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("pointermove", onDrag);
            window.removeEventListener("pointermove", onResize);
            window.removeEventListener("keydown", handleWindowKeydown);
        }
        if (typeof document !== "undefined")
            document.body.style.userSelect = "";
    });

    // Open lifecycle: load encryption state, then chats + limits.
    $effect(() => {
        if (!open) return;
        (async () => {
            await loadKeyState();
        })();
    });

    $effect(() => {
        if (!open) return;
        if ($keyState !== "unlocked") return;
        const userId = $authUser?.id;
        if (!userId) return;
        const tier =
            ($authUser?.app_metadata?.tier as string | undefined) ?? "pro";
        (async () => {
            await refreshLimits(tier);
            await refreshChats(userId);
        })();
    });

    // Auto-scroll on message updates while open.
    $effect(() => {
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
            if ($streaming) {
                stopStreaming();
            } else {
                handleSend();
            }
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

    async function handleSelectChat(id: string) {
        await loadChat(id);
    }

    async function handleDeleteChat(id: string) {
        if (!confirm($t("ai_chat.confirm_delete"))) return;
        const userId = $authUser?.id;
        if (!userId) return;
        await deleteChat(id, userId);
    }

    function handleNewChat() {
        newChat();
    }

    function handleClose() {
        onClose();
    }

    function formatRetry(seconds: number | undefined): string {
        if (!seconds || seconds < 0) return "soon";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m`;
        return `${seconds}s`;
    }

    let storageBytesTotal = $derived($limits?.storage_bytes ?? 0);

    let usagePct = $derived(
        $limits && $limits.storage_bytes > 0
            ? Math.round(($storageBytes / $limits.storage_bytes) * 100)
            : 0,
    );
</script>

{#if open}
    <div
        transition:fly={{ y: 8, duration: 180, opacity: 0 }}
        role="dialog"
        aria-modal="false"
        aria-label={$t("ai_chat.title")}
        tabindex="-1"
        class="fixed flex flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
        style="left:{x}px; top:{y}px; width:{panelW}px; height:{panelH}px; z-index:{zIndex};"
        onpointerdown={() => {
            zIndex = bringToFront();
        }}
    >
        <!-- Header -->
        <div
            class="shrink-0 bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-5 py-4 select-none rounded-t-3xl {isDragging
                ? 'cursor-grabbing'
                : 'cursor-grab'}"
            onpointerdown={startDrag}
            role="banner"
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
                    {#if $keyState === "unlocked"}
                        <button
                            onclick={() => (sidebarOpen = !sidebarOpen)}
                            aria-label={sidebarOpen
                                ? "Hide chat list"
                                : "Show chat list"}
                            title={sidebarOpen
                                ? "Hide chat list"
                                : "Show chat list"}
                            class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-color"
                        >
                            <Icon
                                icon={sidebarOpen
                                    ? "solar:sidebar-minimalistic-bold-duotone"
                                    : "solar:sidebar-minimalistic-bold"}
                                width="1rem"
                                class="dark:text-brand-charcoal-300"
                            />
                        </button>
                        <button
                            onclick={lock}
                            aria-label="Lock"
                            title="Lock"
                            class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                        >
                            <Icon
                                icon="solar:lock-keyhole-bold-duotone"
                                width="0.95rem"
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

        <!-- Body -->
        {#if $keyState === "unlocked"}
            <div class="flex flex-1 min-h-0 overflow-hidden">
                <!-- Sidebar -->
                <div class={sidebarOpen ? "flex" : "hidden"}>
                    <div class="relative flex flex-1 flex-col overflow-hidden">
                        <ChatSidebar
                            chats={$chats}
                            currentChatId={$currentChatId}
                            usedBytes={$storageBytes}
                            totalBytes={storageBytesTotal}
                            disabled={$streaming}
                            onSelect={handleSelectChat}
                            onNew={handleNewChat}
                            onDelete={handleDeleteChat}
                        />
                    </div>
                </div>

                <!-- Thread + input -->
                <div class="flex flex-1 min-w-0 flex-col">
                    <!-- Quota banners -->
                    {#if $quotaBlock}
                        <div
                            class="shrink-0 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-900/40 px-4 py-2 text-[11px] text-red-600 dark:text-red-300 flex items-center gap-2"
                        >
                            <Icon
                                icon="solar:danger-circle-bold-duotone"
                                width="0.85rem"
                            />
                            {$quotaBlock.scope === "storage"
                                ? $quotaBlock.message
                                : $t("ai_chat.quota_blocked").replace(
                                      "{time}",
                                      formatRetry(
                                          $quotaBlock.retryAfterSeconds,
                                      ),
                                  )}
                        </div>
                    {:else if usagePct >= 80 && storageBytesTotal > 0}
                        <div
                            class="shrink-0 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-900/40 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5"
                        >
                            <Icon
                                icon="solar:info-circle-bold-duotone"
                                width="0.8rem"
                            />
                            Storage {usagePct}% full
                        </div>
                    {/if}

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
                                <p class="text-xs">
                                    {$t("ai_chat.empty")}
                                </p>
                            </div>
                        {/if}

                        {#each $messages as msg, i (msg.id ?? `pending-${i}`)}
                            {@const isUser = msg.role === "user"}
                            {@const isStreamingLast =
                                i === $messages.length - 1 && $streaming}
                            <div
                                class="flex {isUser
                                    ? 'justify-end'
                                    : 'justify-start'}"
                            >
                                <div
                                    class="max-w-[85%] flex flex-col {isUser
                                        ? 'items-end'
                                        : 'items-start'}"
                                >
                                    <div
                                        class="chat-bubble relative overflow-visible rounded-[20px] px-4 py-2.5 text-[13px] leading-relaxed {isUser
                                            ? 'chat-bubble-user rounded-br-[5px] bg-brand-gold-400 dark:bg-brand-gold-500 text-gray-100 dark:text-gray-700'
                                            : 'chat-bubble-assistant bg-white dark:bg-[#292c3c] text-brand-charcoal-900 dark:text-[#c6d0f5] border border-brand-sand-200 dark:border-[#414559]'}"
                                    >
                                        <div class="relative z-10">
                                            {#if isUser}
                                                <p class="whitespace-pre-wrap">
                                                    {msg.content}
                                                </p>
                                            {:else if msg.content === "" && isStreamingLast}
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
                                                    {@html renderMarkdown(
                                                        msg.content,
                                                    )}
                                                </div>
                                            {/if}
                                        </div>
                                    </div>

                                    <!-- Copy button (below assistant messages, always visible) -->
                                    {#if !isUser && msg.content && !isStreamingLast}
                                        <button
                                            onclick={() =>
                                                handleCopy(i, msg.content)}
                                            aria-label={$t("ai_chat.copy")}
                                            title={$t("ai_chat.copy")}
                                            class="cursor-pointer mt-1.5 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-brand-charcoal-300 dark:text-[#8087a2] hover:bg-brand-sand-100 dark:hover:bg-[#292c3c] hover:text-brand-charcoal-600 dark:hover:text-[#c6d0f5] transition-colors"
                                        >
                                            {#if copiedIdx === i}
                                                <Icon
                                                    icon="solar:check-circle-bold"
                                                    width="0.75rem"
                                                />
                                                {$t("ai_chat.copied")}
                                            {:else}
                                                <Icon
                                                    icon="solar:copy-bold-duotone"
                                                    width="0.75rem"
                                                />
                                                {$t("ai_chat.copy")}
                                            {/if}
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>

                    <!-- Input -->
                    <div
                        class="shrink-0 bg-brand-sand-50 dark:bg-[#232634] border-t border-brand-sand-200 dark:border-[#414559] px-3 pt-2.5 pb-3 flex flex-col gap-2"
                    >
                        <!-- Model class toggle -->
                        <div class="flex items-center gap-2">
                            <button
                                onclick={() => ($useAdvanced = !$useAdvanced)}
                                disabled={$streaming}
                                class="cursor-pointer flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                                        {$useAdvanced
                                    ? 'border-brand-gold-400 bg-brand-gold-100 dark:bg-brand-gold-900/30 text-brand-gold-600 dark:text-[#e5c890]'
                                    : 'border-brand-sand-200 dark:border-[#414559] text-brand-charcoal-500 bg-transparent text-brand-charcoal-400 dark:text-[#8087a2] hover:bg-brand-sand-100 dark:hover:bg-[#292c3c]'}"
                                title={$useAdvanced
                                    ? $t("ai_chat.advanced_on")
                                    : $t("ai_chat.advanced_off")}
                            >
                                <Icon
                                    icon={$useAdvanced
                                        ? "solar:bolt-bold-duotone"
                                        : "solar:bolt-linear"}
                                    width="0.7rem"
                                />
                                {$useAdvanced
                                    ? $t("ai_chat.model_advanced")
                                    : $t("ai_chat.model_standard")}
                            </button>
                            <span
                                class="text-[11px] text-brand-charcoal-300 dark:text-[#626880] truncate"
                            >
                                {$useAdvanced
                                    ? $t("ai_chat.advanced_hint")
                                    : $t("ai_chat.standard_hint")}
                            </span>
                        </div>

                        <div
                            class="flex items-center gap-2 rounded-full border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2 focus-within:border-brand-gold-400 focus-within:ring-2 focus-within:ring-brand-gold-100 dark:focus-within:ring-brand-gold-900/30 transition-colors"
                        >
                            <textarea
                                bind:value={input}
                                onkeydown={handleKeydown}
                                rows="1"
                                placeholder={$t("ai_chat.placeholder")}
                                disabled={$streaming || !!$quotaBlock}
                                class="flex-1 items-center max-h-40 resize-none bg-transparent text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:outline-none disabled:opacity-50"
                            ></textarea>
                            {#if $streaming}
                                <button
                                    onclick={stopStreaming}
                                    aria-label={$t("ai_chat.stop")}
                                    title={$t("ai_chat.stop")}
                                    class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                                >
                                    <Icon
                                        icon="solar:stop-circle-bold-duotone"
                                        width="0.95rem"
                                    />
                                </button>
                            {:else}
                                <button
                                    onclick={handleSend}
                                    disabled={!input.trim() || !!$quotaBlock}
                                    aria-label={$t("ai_chat.send")}
                                    title={$t("ai_chat.send")}
                                    class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Icon
                                        icon="solar:plain-bold-duotone"
                                        width="0.9rem"
                                    />
                                </button>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>
        {:else if $keyState === "loading"}
            <div
                class="flex flex-1 items-center justify-center bg-brand-sand-50 dark:bg-[#232634]"
            >
                <Icon
                    icon="solar:refresh-circle-bold-duotone"
                    class="animate-spin text-brand-gold-500"
                    width="1.5rem"
                />
            </div>
        {:else}
            <ChatLockScreen />
        {/if}

        <div
            aria-hidden="true"
            class="resize-handle resize-n"
            onpointerdown={(e) =>
                startResize(e, { n: true, s: false, e: false, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-s"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: true, e: false, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-e"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: false, e: true, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-w"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: false, e: false, w: true })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-ne"
            onpointerdown={(e) =>
                startResize(e, { n: true, s: false, e: true, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-se"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: true, e: true, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-sw"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: true, e: false, w: true })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-nw"
            onpointerdown={(e) =>
                startResize(e, { n: true, s: false, e: false, w: true })}
        ></div>
    </div>
{/if}

<style>
    .resize-handle {
        position: absolute;
        z-index: 10;
    }
    .resize-n {
        top: 0;
        left: 6px;
        right: 6px;
        height: 6px;
        cursor: n-resize;
    }
    .resize-s {
        bottom: 0;
        left: 6px;
        right: 6px;
        height: 6px;
        cursor: s-resize;
    }
    .resize-e {
        top: 6px;
        right: 0;
        bottom: 6px;
        width: 6px;
        cursor: e-resize;
    }
    .resize-w {
        top: 6px;
        left: 0;
        bottom: 6px;
        width: 6px;
        cursor: w-resize;
    }
    .resize-ne {
        top: 0;
        right: 0;
        width: 12px;
        height: 12px;
        cursor: ne-resize;
    }
    .resize-se {
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
        cursor: se-resize;
    }
    .resize-sw {
        bottom: 0;
        left: 0;
        width: 12px;
        height: 12px;
        cursor: sw-resize;
    }
    .resize-nw {
        top: 0;
        left: 0;
        width: 12px;
        height: 12px;
        cursor: nw-resize;
    }
    .resize-se::before {
        content: "";
        position: absolute;
        bottom: 12px;
        right: 12px;
        width: 5px;
        height: 5px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.4);
        border-right: 1.5px solid rgba(130, 130, 130, 0.4);
        border-bottom-right-radius: 5px;
        pointer-events: none;
    }
    .resize-se::after {
        content: "";
        position: absolute;
        bottom: 8px;
        right: 8px;
        width: 9px;
        height: 9px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.55);
        border-right: 1.5px solid rgba(130, 130, 130, 0.55);
        border-bottom-right-radius: 9px;
        pointer-events: none;
    }

    /* iMessage-style chat bubble tails */
    .chat-bubble {
        --thread-bg: var(--color-brand-sand-50);
        --bubble-bg: #ffffff;
        --bubble-border: transparent;
        position: relative;
        isolation: isolate;
        filter: drop-shadow(0 1px 1px rgba(47, 47, 47, 0.08));
    }

    .chat-bubble-user {
        --bubble-bg: var(--color-brand-gold-400);
        --bubble-border: var(--color-brand-gold-400);
    }

    .chat-bubble-assistant {
        --bubble-bg: #ffffff;
        --bubble-border: var(--color-brand-sand-200);
    }

    :global(.dark) .chat-bubble {
        --thread-bg: #232634;
        filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.22));
    }

    :global(.dark) .chat-bubble-user {
        --bubble-bg: var(--color-brand-gold-500);
        --bubble-border: var(--color-brand-gold-500);
    }

    :global(.dark) .chat-bubble-assistant {
        --bubble-bg: #292c3c;
        --bubble-border: #414559;
    }

    /* User bubble tail (bottom-right, gold) */
    .chat-bubble-user::before {
        content: "";
        position: absolute;
        right: -7px;
        bottom: -1px;
        width: 20px;
        height: 22px;
        background: var(--bubble-bg);
        border-bottom-left-radius: 18px 16px;
        z-index: 0;
    }
    .chat-bubble-user::after {
        content: "";
        position: absolute;
        right: -18px;
        bottom: -1px;
        width: 18px;
        height: 22px;
        background: var(--thread-bg);
        border-bottom-left-radius: 14px 16px;
        z-index: 1;
    }

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
    :global(.markdown-body pre),
    :global(.markdown-body pre.hljs) {
        margin: 0.6em 0;
        padding: 0.7em 0.9em;
        border-radius: 8px;
        background: var(--hljs-bg) !important;
        color: var(--hljs-fg) !important;
        overflow-x: auto;
        font-size: 12px;
        border: 1px solid var(--hljs-border);
    }
    :global(.markdown-body pre code),
    :global(.markdown-body pre code.hljs) {
        background: transparent !important;
        color: inherit;
        padding: 0;
        font-size: inherit;
    }

    /* Theme-aware syntax highlighting (CSS-variable-driven). */
    :global(.markdown-body) {
        --hljs-bg: #f6f8fa;
        --hljs-fg: #1f2328;
        --hljs-border: rgba(0, 0, 0, 0.06);
        --hljs-comment: #6e7781;
        --hljs-keyword: #cf222e;
        --hljs-string: #0a3069;
        --hljs-number: #0550ae;
        --hljs-function: #8250df;
        --hljs-builtin: #953800;
        --hljs-variable: #116329;
    }
    :global(.dark .markdown-body) {
        --hljs-bg: #151827;
        --hljs-fg: #e6e9ff;
        --hljs-border: rgba(198, 208, 245, 0.14);
        --hljs-comment: #8c93b5;
        --hljs-keyword: #d7a7ff;
        --hljs-string: #b8e994;
        --hljs-number: #ffb78a;
        --hljs-function: #9ec5ff;
        --hljs-builtin: #ffd08a;
        --hljs-variable: #ff9aa2;
    }
    :global(.markdown-body .hljs-comment),
    :global(.markdown-body .hljs-quote) {
        color: var(--hljs-comment);
        font-style: italic;
    }
    :global(.markdown-body .hljs-keyword),
    :global(.markdown-body .hljs-selector-tag),
    :global(.markdown-body .hljs-literal),
    :global(.markdown-body .hljs-section),
    :global(.markdown-body .hljs-doctag),
    :global(.markdown-body .hljs-name),
    :global(.markdown-body .hljs-tag),
    :global(.markdown-body .hljs-meta) {
        color: var(--hljs-keyword);
    }
    :global(.markdown-body .hljs-string),
    :global(.markdown-body .hljs-regexp),
    :global(.markdown-body .hljs-meta-string) {
        color: var(--hljs-string);
    }
    :global(.markdown-body .hljs-number),
    :global(.markdown-body .hljs-symbol),
    :global(.markdown-body .hljs-bullet),
    :global(.markdown-body .hljs-link) {
        color: var(--hljs-number);
    }
    :global(.markdown-body .hljs-title),
    :global(.markdown-body .hljs-title.class_),
    :global(.markdown-body .hljs-title.function_) {
        color: var(--hljs-function);
    }
    :global(.markdown-body .hljs-built_in),
    :global(.markdown-body .hljs-builtin-name) {
        color: var(--hljs-builtin);
    }
    :global(.markdown-body .hljs-attribute),
    :global(.markdown-body .hljs-attr),
    :global(.markdown-body .hljs-variable),
    :global(.markdown-body .hljs-template-variable),
    :global(.markdown-body .hljs-type),
    :global(.markdown-body .hljs-selector-class),
    :global(.markdown-body .hljs-selector-attr),
    :global(.markdown-body .hljs-selector-pseudo) {
        color: var(--hljs-variable);
    }

    /* KaTeX block spacing — inherits color from surrounding markdown body. */
    :global(.markdown-body .math-display) {
        margin: 0.6em 0;
        overflow-x: auto;
        text-align: center;
    }
    :global(.markdown-body .math-inline) {
        display: inline;
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
