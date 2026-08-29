<script lang="ts">
    import Icon from '@iconify/svelte';
    import type { Snippet } from 'svelte';
    import { t } from '$lib/i18n';
    import WindowControls from './WindowControls.svelte';

    interface Props {
        icon: string;
        title: string;
        isDragging: boolean;
        onClose: () => void;
        onpointerdown: (e: PointerEvent) => void;
        /** Optional control(s) rendered in the title row, left of the close button. */
        action?: Snippet;
        children?: Snippet;
        /**
         * This bar *is* the window's title bar: it becomes a drag region, drops
         * its close button (the frame's own controls take over) and, off macOS,
         * draws those controls itself.
         */
        standalone?: boolean;
        /**
         * Drop the close button without the rest of the standalone treatment —
         * for a sheet that hangs off the app header, where dismissing is done
         * by clicking away rather than by a button in the corner.
         */
        hideClose?: boolean;
        /**
         * The panel hangs off the app header rather than floating: the bar
         * takes the header's own surface so the two read as one continuous
         * piece of chrome, and loses the rounded top corners that would draw a
         * seam between them.
         */
        sheet?: boolean;
    }

    let {
        icon,
        title,
        isDragging,
        onClose,
        onpointerdown,
        action,
        children,
        standalone = false,
        hideClose = false,
        sheet = false,
    }: Props = $props();

    // macOS keeps native traffic lights overlaid on the header; the other
    // platforms run the window undecorated and draw their own controls.
    const isMac =
        typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
</script>

<div
    data-tauri-drag-region={standalone ? true : undefined}
    class="flex flex-col shrink-0 select-none {sheet
        ? 'bg-brand-sand-50/95 dark:bg-[#2b2b2b]/95 border-b border-brand-sand-200 dark:border-[#414559]'
        : 'bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559]'} {standalone ||
    sheet
        ? ''
        : isDragging
          ? 'rounded-t-xl cursor-grabbing'
          : 'rounded-t-xl cursor-grab'}"
    onpointerdown={standalone ? undefined : onpointerdown}
    role="banner"
>
    <div
        data-tauri-drag-region={standalone ? true : undefined}
        class="flex items-center justify-between gap-2 px-4 py-1.5"
        style:padding-left={standalone && isMac ? '5rem' : undefined}
    >
        <div
            data-tauri-drag-region={standalone ? true : undefined}
            class="flex items-center gap-2"
        >
            <Icon {icon} width="1.1rem" class="text-brand-gold-500" />
            <span class="text-[0.6875rem] font-semibold uppercase tracking-wide
                         text-brand-charcoal-500 dark:text-[#838ba7] py-2">
                {title}
            </span>
        </div>
        <div class="ml-auto flex items-center gap-1.5">
            {#if action}
                {@render action()}
            {/if}
            <!-- Closing is the window's job once this bar *is* the title bar;
                 the floating panel keeps its own button. -->
            {#if !standalone && !hideClose}
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
            {/if}
        </div>

        {#if standalone && !isMac}
            <div class="-my-1.5 -mr-2 flex self-stretch">
                <WindowControls />
            </div>
        {/if}
    </div>
    {#if children}
        {@render children()}
    {/if}
</div>
