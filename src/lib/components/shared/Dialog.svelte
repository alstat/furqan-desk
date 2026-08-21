<script lang="ts">
    import Icon from '@iconify/svelte';
    import type { Snippet } from 'svelte';
    import { fly } from 'svelte/transition';
    import { t } from '$lib/i18n';

    interface Props {
        open: boolean;
        title: string;
        onClose: () => void;
        children: Snippet;
        footer?: Snippet;
        maxWidth?: string;
        /** Optional min-height class for the panel (e.g. 'min-h-[70vh]'); the body grows to fill it. */
        minHeight?: string;
    }

    const { open, title, onClose, children, footer, maxWidth = 'max-w-md', minHeight = '' }: Props = $props();
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') onClose(); }} />

{#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
        <div transition:fly={{ y: 8, duration: 180, opacity: 0 }} class="relative mx-4 w-full {maxWidth} {minHeight} rounded-3xl border border-brand-sand-200 bg-white dark:bg-brand-sand-50 shadow-xl dark:shadow-black/40 flex flex-col max-h-[80vh] overflow-hidden">
            <!-- Header -->
            <div class="flex items-center justify-between border-b border-brand-gold-200 px-5 py-4 bg-brand-gold-100 dark:bg-brand-sand-100 rounded-t-3xl">
                <h2 class="text-sm font-semibold text-brand-charcoal-900">{title}</h2>
                <button
                    onclick={onClose}
                    class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-brand-sand-200 text-brand-gold-600 hover:bg-brand-gold-200/80 dark:hover:bg-brand-sand-400 transition-colors"
                    aria-label={$t('common.close')}
                >
                    <Icon icon="solar:close-circle-bold-duotone" width="1.1rem" />
                </button>
            </div>

            <!-- Body -->
            <div class="default-scroll grow overflow-y-auto px-5 py-3">
                {@render children()}
            </div>

            <!-- Footer (optional) -->
            {#if footer}
                <div class="border-t border-slate-100 dark:border-brand-sand-200 px-5 py-3">
                    {@render footer()}
                </div>
            {/if}
        </div>
    </div>
{/if}
