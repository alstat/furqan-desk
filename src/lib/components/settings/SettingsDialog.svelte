<script lang="ts">
    import Icon from '@iconify/svelte';
    import Dialog from '$lib/components/shared/Dialog.svelte';
    import { appDarkMode } from '$lib/stores/editor.store';
    import { restartTour } from '$lib/stores/tour.store';

    interface Props {
        open: boolean;
        onClose: () => void;
    }

    let { open, onClose }: Props = $props();

    function handleRestartTour() {
        onClose();
        restartTour();
    }

    const sectionLabel = 'text-xs font-semibold uppercase tracking-wide text-brand-charcoal-300 mb-2';
    const rowLabel = 'text-xs text-slate-600 dark:text-[#c6d0f5]';
    const actionBtn =
        'cursor-pointer flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5] transition-colors';
</script>

<Dialog {open} title="Settings" {onClose}>
    {#snippet children()}
        <!-- Tutorial -->
        <div class="py-2">
            <p class={sectionLabel}>Tutorial</p>
            <div class="flex items-center justify-between">
                <span class={rowLabel}>Start the app tutorial</span>
                <button onclick={handleRestartTour} class={actionBtn}>
                    <Icon icon="solar:play-circle-bold-duotone" width="0.85rem" />
                    Restart Tour
                </button>
            </div>
        </div>

        <!-- Appearance -->
        <div class="py-2 border-t border-slate-100 dark:border-[#414559]">
            <p class={sectionLabel}>Appearance</p>
            <div class="flex items-center justify-between">
                <span class={rowLabel}>Dark mode</span>
                <div class="flex gap-2">
                    <button
                        onclick={() => appDarkMode.set(false)}
                        class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                            ${!$appDarkMode
                                ? 'bg-brand-gold-400 text-white border-brand-gold-400'
                                : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                    >
                        Light
                    </button>
                    <button
                        onclick={() => appDarkMode.set(true)}
                        class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                            ${$appDarkMode
                                ? 'bg-[#1a1d2e] text-[#c8a96a] border-[#3e4568]'
                                : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                    >
                        Dark
                    </button>
                </div>
            </div>
        </div>
    {/snippet}
</Dialog>
