<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import type { ChatSummary } from "$lib/stores/chat-storage";

    interface Props {
        chats: ChatSummary[];
        currentChatId: string | null;
        usedBytes: number;
        totalBytes: number;
        disabled: boolean;
        onSelect: (id: string) => void;
        onNew: () => void;
        onDelete: (id: string) => void;
    }

    let {
        chats,
        currentChatId,
        usedBytes,
        totalBytes,
        disabled,
        onSelect,
        onNew,
        onDelete,
    }: Props = $props();

    function formatMB(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    function relativeTime(iso: string): string {
        const d = new Date(iso);
        const diff = Date.now() - d.getTime();
        const min = 60 * 1000;
        const hr = 60 * min;
        const day = 24 * hr;
        if (diff < min) return "just now";
        if (diff < hr) return `${Math.floor(diff / min)}m`;
        if (diff < day) return `${Math.floor(diff / hr)}h`;
        if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
        return d.toLocaleDateString();
    }

    let pct = $derived(
        totalBytes > 0
            ? Math.min(100, Math.round((usedBytes / totalBytes) * 100))
            : 0,
    );
</script>

<div
    class="flex h-full w-64 px-3 shrink-0 flex-col border-r border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#1e2030]"
>
    <!-- New chat -->
    <div class="shrink-0 py-2 mt-2">
        <button
            onclick={onNew}
            {disabled}
            class="cursor-pointer w-full flex items-center justify-center gap-2 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-3 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
            <Icon icon="solar:add-circle-bold-duotone" width="0.95rem" />
            {$t("ai_chat.new_chat")}
        </button>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto pb-2">
        {#if chats.length === 0}
            <p
                class="px-3 py-6 text-center text-xs text-brand-charcoal-300 dark:text-[#626880]"
            >
                {$t("ai_chat.no_chats")}
            </p>
        {:else}
            {#each chats as c (c.id)}
                <div
                    class="group relative mb-1 rounded-full px-3 {currentChatId ===
                    c.id
                        ? 'bg-brand-gold-100 dark:bg-brand-gold-900/20'
                        : 'hover:bg-brand-sand-100 dark:hover:bg-[#292c3c]'}"
                >
                    <button
                        onclick={() => onSelect(c.id)}
                        class="cursor-pointer block w-full text-left px-3 py-2.5 pr-8"
                    >
                        <p
                            class="truncate text-xs font-medium text-brand-charcoal-900 dark:text-[#c6d0f5]"
                        >
                            {c.title}
                        </p>
                        <p
                            class="text-xs text-brand-charcoal-300 dark:text-[#8087a2]"
                        >
                            {relativeTime(c.updatedAt)}
                        </p>
                    </button>
                    <button
                        onclick={() => onDelete(c.id)}
                        aria-label={$t("ai_chat.delete_chat")}
                        title={$t("ai_chat.delete_chat")}
                        class="cursor-pointer absolute right-1.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-brand-charcoal-300 dark:text-[#8087a2] opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                    >
                        <Icon
                            icon="solar:trash-bin-trash-bold-duotone"
                            width="0.85rem"
                        />
                    </button>
                </div>
            {/each}
        {/if}
    </div>

    <!-- Storage indicator -->
    {#if totalBytes > 0}
        <div
            class="shrink-0 border-t border-brand-sand-200 dark:border-[#414559] px-3 py-2"
        >
            <div
                class="flex items-center justify-between text-xs text-brand-charcoal-300 dark:text-[#8087a2]"
            >
                <span>{formatMB(usedBytes)} / {formatMB(totalBytes)}</span>
                <span>{pct}%</span>
            </div>
            <div
                class="mt-1 h-1 w-full overflow-hidden rounded-full bg-brand-sand-200 dark:bg-[#292c3c]"
            >
                <div
                    class="h-full rounded-full {pct > 90
                        ? 'bg-red-500'
                        : pct > 75
                          ? 'bg-amber-500'
                          : 'bg-brand-gold-400'}"
                    style:width="{pct}%"
                ></div>
            </div>
        </div>
    {/if}
</div>
