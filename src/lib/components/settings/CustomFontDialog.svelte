<script lang="ts">
    import Icon from '@iconify/svelte';
    import { invoke } from '@tauri-apps/api/core';
    import Dialog from '$lib/components/shared/Dialog.svelte';
    import {
        customFontFamilies,
        addCustomFontFamily,
        removeCustomFontFamily,
        resetCustomFontFamilies,
    } from '$lib/stores/editor.store';
    import { t } from '$lib/i18n';

    interface Props {
        open: boolean;
        onClose: () => void;
    }

    let { open, onClose }: Props = $props();

    const sectionLabel = 'text-xs font-semibold uppercase tracking-wide text-brand-charcoal-300 mb-2';
    const actionBtn =
        'cursor-pointer flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5] transition-colors';

    let systemFonts = $state<string[]>([]);
    let systemFontsLoading = $state(false);
    let systemFontsError = $state('');
    let systemFontSearch = $state('');
    let customFontErrorKey = $state<string | null>(null);

    const filteredSystemFonts = $derived.by(() => {
        const query = systemFontSearch.trim().toLocaleLowerCase();
        if (!query) return systemFonts;
        return systemFonts.filter((font) => font.toLocaleLowerCase().includes(query));
    });

    async function loadSystemFonts() {
        if (systemFontsLoading) return;
        systemFontsLoading = true;
        systemFontsError = '';
        try {
            systemFonts = await invoke<string[]>('get_system_font_families');
        } catch {
            systemFontsError = $t('settings.custom_fonts.load_error');
            systemFonts = [];
        } finally {
            systemFontsLoading = false;
        }
    }

    $effect(() => {
        if (open && systemFonts.length === 0) {
            loadSystemFonts();
        }
    });

    function handleAddCustomFont(fontName: string) {
        const result = addCustomFontFamily(fontName);
        if (result === 'added') {
            customFontErrorKey = null;
            return;
        }
        customFontErrorKey =
            result === 'empty'
                ? 'settings.custom_fonts.error_empty'
                : 'settings.custom_fonts.error_duplicate';
    }

    function handleResetCustomFonts() {
        resetCustomFontFamilies();
        customFontErrorKey = null;
    }
</script>

<Dialog
    {open}
    title={$t('settings.custom_fonts.dialog_title')}
    onClose={() => {
        customFontErrorKey = null;
        onClose();
    }}
>
    {#snippet children()}
        <p class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7] mb-2">
            {$t('settings.custom_fonts.desc')}
        </p>

        <div class="mb-2">
            <input
                type="text"
                bind:value={systemFontSearch}
                placeholder={$t('settings.custom_fonts.search_placeholder')}
                class="w-full rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-3 py-1.5 text-xs text-brand-charcoal-500 dark:text-[#c6d0f5] transition-all focus:border-brand-gold-400 dark:focus:border-[#e5c890] focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20"
            />
        </div>

        {#if customFontErrorKey}
            <p class="mb-2 text-[11px] text-red-500 dark:text-red-400">{$t(customFontErrorKey)}</p>
        {/if}

        <p class={sectionLabel}>{$t('settings.custom_fonts.available')}</p>
        {#if systemFontsLoading}
            <p class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]">{$t('settings.custom_fonts.loading')}</p>
        {:else if systemFontsError}
            <p class="text-[11px] text-red-500 dark:text-red-400">{systemFontsError}</p>
        {:else if filteredSystemFonts.length === 0}
            <p class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]">{$t('settings.custom_fonts.no_matches')}</p>
        {:else}
            <div class="max-h-48 overflow-y-auto default-scroll rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/60 dark:bg-[#292c3c] p-2 space-y-1">
                {#each filteredSystemFonts as font}
                    <div class="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]">
                        <span class="text-xs text-brand-charcoal-500 dark:text-[#c6d0f5] truncate" style={`font-family: "${font}", sans-serif;`}>
                            {font}
                        </span>
                        <button onclick={() => handleAddCustomFont(font)} class={actionBtn}>
                            <Icon icon="solar:add-circle-bold-duotone" width="0.8rem" />
                            {$t('settings.custom_fonts.add')}
                        </button>
                    </div>
                {/each}
            </div>
        {/if}

        <div class="mt-3">
            <p class={sectionLabel}>{$t('settings.custom_fonts')}</p>
            {#if $customFontFamilies.length === 0}
                <p class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]">{$t('settings.custom_fonts.empty')}</p>
            {:else}
                <div class="flex flex-wrap gap-2">
                    {#each $customFontFamilies as font}
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#363a4f] text-brand-charcoal-500 dark:text-[#c6d0f5]">
                            {font}
                            <button
                                onclick={() => removeCustomFontFamily(font)}
                                class="cursor-pointer rounded-full hover:text-red-500"
                                title={$t('settings.custom_fonts.remove')}
                                aria-label={$t('settings.custom_fonts.remove')}
                            >
                                <Icon icon="solar:close-circle-bold" width="0.8rem" />
                            </button>
                        </span>
                    {/each}
                </div>
                <div class="mt-2">
                    <button onclick={handleResetCustomFonts} class={actionBtn}>
                        <Icon icon="solar:trash-bin-trash-bold-duotone" width="0.85rem" />
                        {$t('settings.custom_fonts.reset')}
                    </button>
                </div>
            {/if}
        </div>
    {/snippet}
</Dialog>
