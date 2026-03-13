<script lang="ts">
    import Icon from '@iconify/svelte';
    import Dialog from '$lib/components/shared/Dialog.svelte';
    import { appDarkMode } from '$lib/stores/editor.store';
    import { restartTour } from '$lib/stores/tour.store';
    import { invoke } from '@tauri-apps/api/core';
    import { manuscriptsEnabled } from '$lib/stores/manuscripts.store';

    interface Props {
        open: boolean;
        onClose: () => void;
        onOpenHelp: () => void;
    }

    let { open, onClose, onOpenHelp }: Props = $props();

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
        <!-- Help -->
        <div class="py-2">
            <p class={sectionLabel}>Help</p>
            <div class="flex items-center justify-between">
                <span class={rowLabel}>Browse the user guide</span>
                <button onclick={onOpenHelp} class={actionBtn}>
                    <Icon icon="solar:question-circle-bold-duotone" width="0.85rem" />
                    Open Help
                </button>
            </div>
        </div>

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

        <!-- Manuscripts -->
        <div class="py-2 border-t border-slate-100 dark:border-[#414559]">
            <p class={sectionLabel}>Manuscripts</p>
            <div class="flex items-center justify-between mb-2">
                <span class={rowLabel}>Browse early Quranic manuscripts</span>
                <div class="flex gap-2">
                    <button
                        onclick={() => manuscriptsEnabled.set(false)}
                        class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                            ${!$manuscriptsEnabled
                                ? 'bg-brand-gold-400 text-white border-brand-gold-400'
                                : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                    >
                        Disabled
                    </button>
                    <button
                        onclick={() => manuscriptsEnabled.set(true)}
                        class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                            ${$manuscriptsEnabled
                                ? 'bg-brand-gold-400 text-white border-brand-gold-400'
                                : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                    >
                        Enabled
                    </button>
                </div>
            </div>
            <div class="flex items-center justify-between">
                <span class={rowLabel}>Clear cached manuscript images</span>
                <button
                    onclick={() => invoke('clear_manuscript_cache')}
                    class={actionBtn}
                >
                    <Icon icon="solar:trash-bin-trash-bold-duotone" width="0.85rem" />
                    Clear Cache
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
