<script lang="ts">
    import Icon from '@iconify/svelte';
    import type { Snippet } from 'svelte';

    interface Props {
        open: boolean;
        title: string;
        onClose: () => void;
        children: Snippet;
        footer?: Snippet;
    }

    const { open, title, onClose, children, footer }: Props = $props();
</script>

{#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
        <div class="relative mx-4 w-full max-w-md rounded-xl bg-white dark:bg-[#303446] shadow-2xl flex flex-col max-h-[80vh]">
            <!-- Header -->
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-[#414559] px-5 py-4">
                <h2 class="text-sm font-semibold text-slate-700 dark:text-[#c6d0f5]">{title}</h2>
                <button
                    onclick={onClose}
                    class="cursor-pointer rounded-md p-1 text-slate-400 dark:text-[#838ba7] hover:bg-slate-100 dark:hover:bg-[#414559] hover:text-slate-600 dark:hover:text-[#c6d0f5] transition-colors"
                    aria-label="Close"
                >
                    <Icon icon="solar:close-circle-linear" width="1.1rem" />
                </button>
            </div>

            <!-- Body -->
            <div class="overflow-y-auto px-5 py-3">
                {@render children()}
            </div>

            <!-- Footer (optional) -->
            {#if footer}
                <div class="border-t border-slate-100 dark:border-[#414559] px-5 py-3">
                    {@render footer()}
                </div>
            {/if}
        </div>
    </div>
{/if}
