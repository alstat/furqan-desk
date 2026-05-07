<script lang="ts">
    import Icon from '@iconify/svelte';
    import type { Snippet } from 'svelte';
    import { t } from '$lib/i18n';

    interface Props {
        icon: string;
        title: string;
        isDragging: boolean;
        onClose: () => void;
        onpointerdown: (e: PointerEvent) => void;
        children?: Snippet;
    }

    let { icon, title, isDragging, onClose, onpointerdown, children }: Props = $props();
</script>

<div
    class="flex flex-col shrink-0 bg-brand-gold-100 dark:bg-[#292c3c]
           border-b border-brand-gold-200 dark:border-[#414559]
           select-none rounded-t-3xl
           {isDragging ? 'cursor-grabbing' : 'cursor-grab'}"
    {onpointerdown}
    role="banner"
>
    <div class="flex items-center justify-between px-4 py-1.5">
        <div class="flex items-center gap-2">
            <Icon {icon} width="1.1rem" class="text-brand-gold-500" />
            <span class="text-[11px] font-semibold uppercase tracking-wide
                         text-brand-charcoal-500 dark:text-[#838ba7] py-2">
                {title}
            </span>
        </div>
        <button
            onclick={onClose}
            aria-label={$t('common.close')}
            class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg
                   bg-brand-gold-200 dark:bg-[#414559]
                   text-brand-gold-600 dark:text-[#c6d0f5]
                   hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
        >
            <Icon icon="solar:close-circle-bold-duotone" width="0.85rem" />
        </button>
    </div>
    {#if children}
        {@render children()}
    {/if}
</div>
