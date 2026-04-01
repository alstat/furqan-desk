<script lang="ts">
    import { openUrl } from '@tauri-apps/plugin-opener';
    import Icon from '@iconify/svelte';
    import { fly } from 'svelte/transition';

    const KOFI_URL = 'https://ko-fi.com/alahmadgaidasaad';

    interface Props {
        open: boolean;
        onClose: () => void;
    }

    let { open: isOpen, onClose }: Props = $props();

    let selectedQR = $state<'gcash' | 'maya' | 'bpi'>('gcash');

    const qrImages: Record<'gcash' | 'maya' | 'bpi', string> = {
        gcash: '/donation_qr/GCASH_PH.jpg',
        maya: '/donation_qr/MAYA_PH.jpg',
        bpi: '/donation_qr/BPI_PH_BANK.jpg',
    };

    const qrLabels: Record<'gcash' | 'maya' | 'bpi', string> = {
        gcash: 'GCash',
        maya: 'Maya',
        bpi: 'BPI',
    };

    function handleKofi() {
        openUrl(KOFI_URL);
    }
</script>

{#if isOpen}
    <div
        role="dialog"
        aria-modal="true"
        aria-label="Support AyahLab"
        tabindex="-1"
        class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-brand-charcoal-900/30 backdrop-blur-sm"
        onclick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}
        onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
        <div
            transition:fly={{ y: 8, duration: 180, opacity: 0 }}
            class="flex w-full max-w-sm flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
            style="max-height: 90vh;"
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
                                icon="solar:heart-bold-duotone"
                                class="text-brand-gold-500 dark:text-[#e5c890]"
                                width="1rem"
                            />
                        </div>
                        <div>
                            <h2
                                class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                            >
                                Support AyahLab
                            </h2>
                            <p
                                class="text-[11px] text-brand-charcoal-300 dark:text-[#8087a2]"
                            >
                                Keep the app free
                            </p>
                        </div>
                    </div>
                    <button
                        onclick={onClose}
                        aria-label="Close"
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    >
                        <Icon icon="solar:close-circle-bold-duotone" width="1rem" />
                    </button>
                </div>
            </div>

            <!-- Body -->
            <div
                class="flex-1 overflow-y-auto bg-brand-sand-50 dark:bg-[#232634] px-5 py-4 flex flex-col gap-4"
            >
                <!-- Ko-fi card -->
                <div
                    class="flex flex-col gap-2 rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] px-4 py-3"
                >
                    <div class="flex items-center gap-2">
                        <Icon
                            icon="solar:heart-bold-duotone"
                            class="text-brand-gold-500 dark:text-[#e5c890]"
                            width="1.1rem"
                        />
                        <span class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]">Ko-fi</span>
                    </div>
                    <p class="text-[11px] text-brand-charcoal-300 dark:text-[#8087a2]">
                        Supports PayPal, credit &amp; debit cards
                    </p>
                    <button
                        onclick={handleKofi}
                        class="cursor-pointer flex items-center justify-center gap-1.5 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-4 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 transition-colors"
                    >
                        <Icon icon="solar:heart-bold" width="0.8rem" />
                        Donate on Ko-fi →
                    </button>
                </div>

                <!-- PH Only section -->
                <div class="flex flex-col gap-3">
                    <div class="flex items-center gap-1.5">
                        <span class="text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#8087a2] flex items-center gap-1"><Icon icon="emojione:flag-for-philippines" width="1rem" /> PH Only</span>
                    </div>

                    <!-- Segmented control -->
                    <div class="flex rounded-full border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] p-1 gap-1">
                        {#each (['gcash', 'maya', 'bpi'] as const) as tab}
                            <button
                                onclick={() => { selectedQR = tab; }}
                                class="flex-1 rounded-full py-1.5 text-[11px] font-semibold transition-colors cursor-pointer
                                    {selectedQR === tab
                                        ? 'bg-brand-gold-400 dark:bg-brand-gold-600 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 shadow-sm'
                                        : 'text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#292c3c]'}"
                            >
                                {qrLabels[tab]}
                            </button>
                        {/each}
                    </div>

                    <!-- QR image -->
                    <div class="flex flex-col items-center gap-2">
                        <img
                            src={qrImages[selectedQR]}
                            alt="{qrLabels[selectedQR]} QR code"
                            style="max-width: 180px; max-height: 180px; width: 100%; border-radius: 12px;"
                            class="border border-brand-sand-200 dark:border-[#414559] shadow"
                        />
                        <p class="text-[11px] text-brand-charcoal-300 dark:text-[#8087a2] text-center">
                            Scan with {qrLabels[selectedQR]} app
                        </p>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div
                class="shrink-0 bg-brand-sand-50 dark:bg-[#232634] border-t border-brand-sand-200 dark:border-[#414559] px-5 py-3 flex items-center justify-end"
            >
                <button
                    onclick={onClose}
                    class="cursor-pointer flex items-center gap-1.5 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-5 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 transition-colors"
                >
                    <Icon icon="solar:close-circle-bold-duotone" width="0.8rem" />
                    Close
                </button>
            </div>
        </div>
    </div>
{/if}
