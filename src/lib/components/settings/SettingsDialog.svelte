<script lang="ts">
    import Icon from '@iconify/svelte';
import Dialog from '$lib/components/shared/Dialog.svelte';
    import ShortcutsDialog from './ShortcutsDialog.svelte';
    import IndeterminateProgress from '$lib/components/shared/IndeterminateProgress.svelte';
    import {
        appDarkMode,
        zenMode,
        zenTabsOpacity,
        ZEN_TABS_OPACITY_BOUNDS,
        customFontFamilies,
        typstPreviewDarkMode,
        editorIndentSize,
        uiFontScale,
        UI_FONT_SCALE_BOUNDS,
    } from '$lib/stores/editor.store';
    import { openCustomFontDialog } from '$lib/stores/custom-font-dialog.store';
    import { restartTour } from '$lib/stores/tour.store';
    import { invoke } from '@tauri-apps/api/core';
    import { morphGlassEffect } from '$lib/stores/morphology.store';
    import { onMount } from 'svelte';
    import {
        juliaInstalledVersion,
        juliaLatestVersion,
        juliaInstallState,
        juliaInstallError,
        juliaInstallMessage,
        initJuliaInstallStore,
        checkJuliaVersion,
        updateJulia,
        setJuliaVersion as setJuliaVersionStore,
        juliaSettingsOpen,
    } from '$lib/stores/julia-install.store';
    import {
        leanInstalledVersion,
        leanLatestVersion,
        leanInstallState,
        leanInstallError,
        leanInstallMessage,
        initLeanInstallStore,
        checkLeanVersion,
        updateLean,
        setLeanVersion as setLeanVersionStore,
        leanSettingsOpen,
    } from '$lib/stores/lean-install.store';
    import { openUrl } from '@tauri-apps/plugin-opener';
    import { getVersion } from '@tauri-apps/api/app';
    import { animationsEnabled } from '$lib/stores/animations.store';
    import { locale, LOCALE_NAMES, t, type Locale } from '$lib/i18n';
    import { aiTextDefaultModel } from '$lib/stores/ai-text-transform.store';
    import { isPro } from '$lib/stores/auth.store';

    interface Props {
        open: boolean;
        onClose: () => void;
    }

    let { open, onClose }: Props = $props();

    let showShortcuts = $state(false);

    // The Advanced AI model is available to every Pro account. Free accounts
    // never see this section at all, so the effective model only needs to
    // fall back to 'standard' when $isPro is false.
    let effTextModel = $derived($isPro ? $aiTextDefaultModel : 'standard');

    // Mirror the dialog's open state into the store so the background
    // install/update toast can hide itself while Settings is showing progress.
    $effect(() => {
        juliaSettingsOpen.set(open);
        leanSettingsOpen.set(open);
        return () => {
            juliaSettingsOpen.set(false);
            leanSettingsOpen.set(false);
        };
    });

    function handleRestartTour() {
        onClose();
        restartTour();
    }

    const groupTitle = 'text-[0.8125rem] font-bold tracking-tight text-brand-charcoal-900 dark:text-[#c6d0f5]';
    const sectionLabel = 'text-xs font-semibold uppercase tracking-wide text-brand-charcoal-300 mb-2';
    const rowLabel = 'text-xs text-slate-600 dark:text-[#c6d0f5]';
    const actionBtn =
        'cursor-pointer flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5] transition-colors';
    const stepBtn =
        'cursor-pointer flex items-center justify-center w-7 h-7 rounded-full border border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

    // ── UI font scale (accessibility) ────────────────────────────────────────
    function decUiFontScale() {
        uiFontScale.set($uiFontScale - UI_FONT_SCALE_BOUNDS.step);
    }
    function incUiFontScale() {
        uiFontScale.set($uiFontScale + UI_FONT_SCALE_BOUNDS.step);
    }
    function resetUiFontScale() {
        uiFontScale.set(UI_FONT_SCALE_BOUNDS.default);
    }

    // ── Manuscript cache size ─────────────────────────────────────────────────
    let manuscriptCacheSize = $state<string | null>(null);

    async function refreshCacheSize() {
        try {
            manuscriptCacheSize = await invoke<string>('get_manuscript_cache_size');
        } catch {}
    }

    // ── App version state ─────────────────────────────────────────────────────
    let appVersion       = $state<string | null>(null);
    let latestAppVersion = $state<string | null>(null);
    let appCheckState    = $state<'idle' | 'checking' | 'error'>('idle');
    let appCheckError    = $state('');

    // ── Julia version state (lives in store so installs survive dialog close) ─
    let juliaTargetVersion = $state('');

    function isNewer(latest: string, current: string): boolean {
        const parts = (v: string) => v.split('.').map(Number);
        const [la, lb, lc = 0] = parts(latest);
        const [ca, cb, cc = 0] = parts(current);
        if (la !== ca) return la > ca;
        if (lb !== cb) return lb > cb;
        return lc > cc;
    }

    async function setJuliaVersion() {
        const target = juliaTargetVersion;
        await setJuliaVersionStore(target);
        if ($juliaInstallState === 'idle') juliaTargetVersion = '';
    }

    // ── Lean version state (same store-backed pattern as Julia) ──────────────
    let leanTargetVersion = $state('');

    async function setLeanVersion() {
        const target = leanTargetVersion;
        await setLeanVersionStore(target);
        if ($leanInstallState === 'idle') leanTargetVersion = '';
    }

    onMount(async () => {
        try { appVersion = await getVersion(); } catch {}
        await refreshCacheSize();
        await initJuliaInstallStore();
        await initLeanInstallStore();
    });
</script>

<Dialog
    {open}
    title="Settings"
    {onClose}
    maxWidth="max-w-md md:max-w-xl lg:max-w-2xl xl:max-w-3xl"
>
    {#snippet children()}
        <div class="space-y-1">

        <!-- ═══════════════ GROUP: General ═══════════════ -->
        <section class="py-3 first:pt-1">
            <div class="flex items-center gap-2 pb-2.5 mb-3 border-b border-brand-gold-200/60 dark:border-[#414559]">
                <Icon icon="solar:tuning-square-bold-duotone" class="text-brand-gold-400" width="1rem" />
                <h3 class={groupTitle}>{$t('settings.group.general')}</h3>
            </div>
            <div class="space-y-4">

            <!-- Language -->
            <div>
                <p class={sectionLabel}>{$t('settings.language')}</p>
                <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] mb-2">
                    {$t('settings.language.desc')}
                </p>
                <div class="relative">
                    <select
                        value={$locale}
                        onchange={(e) => locale.set(e.currentTarget.value as Locale)}
                        class="w-full appearance-none cursor-pointer rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-3 py-1.5 pr-8 text-xs text-brand-charcoal-500 dark:text-[#c6d0f5] transition-all focus:border-brand-gold-400 dark:focus:border-[#e5c890] focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20 hover:border-brand-sand-400 dark:hover:border-[#626880] hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]"
                    >
                        {#each Object.entries(LOCALE_NAMES).sort(([, a], [, b]) => a.localeCompare(b)) as [code, name]}
                            <option value={code}>{name}</option>
                        {/each}
                    </select>
                    <span class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300">
                        <Icon icon="charm:chevron-down" width="0.75rem" />
                    </span>
                </div>
            </div>

            <!-- Appearance -->
            <div>
                <p class={sectionLabel}>{$t('settings.appearance')}</p>
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <span class={rowLabel}>{$t('settings.appearance.animations')}</span>
                        <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] mt-0.5">
                            {$t('settings.appearance.animations.desc')}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button
                            onclick={() => animationsEnabled.set(false)}
                            class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                                ${!$animationsEnabled
                                    ? 'bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400'
                                    : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                        >
                            {$t('common.disabled')}
                        </button>
                        <button
                            onclick={() => animationsEnabled.set(true)}
                            class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                                ${$animationsEnabled
                                    ? 'bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400'
                                    : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                        >
                            {$t('common.enabled')}
                        </button>
                    </div>
                </div>
                <div class="flex items-center justify-between">
                    <div>
                        <span class={rowLabel}>{$t('settings.appearance.glass')}</span>
                        <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] mt-0.5">
                            {$t('settings.appearance.glass.desc')}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button
                            onclick={() => morphGlassEffect.set(false)}
                            class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                                ${!$morphGlassEffect
                                    ? 'bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400'
                                    : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                        >
                            {$t('common.disabled')}
                        </button>
                        <button
                            onclick={() => morphGlassEffect.set(true)}
                            class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                                ${$morphGlassEffect
                                    ? 'bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400'
                                    : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                        >
                            {$t('common.enabled')}
                        </button>
                    </div>
                </div>
                <!-- Typst Preview Dark Mode -->
                <div class="flex items-center justify-between mt-3">
                    <div>
                        <span class={rowLabel}>{$t('settings.appearance.typst_preview_dark')}</span>
                        <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] mt-0.5">
                            {$t('settings.appearance.typst_preview_dark.desc')}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button
                            onclick={() => typstPreviewDarkMode.set(false)}
                            class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                                ${!$typstPreviewDarkMode
                                    ? 'bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400'
                                    : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                        >
                            {$t('common.disabled')}
                        </button>
                        <button
                            onclick={() => typstPreviewDarkMode.set(true)}
                            class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                                ${$typstPreviewDarkMode
                                    ? 'bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400'
                                    : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                        >
                            {$t('common.enabled')}
                        </button>
                    </div>
                </div>
                <!-- Zen Mode -->
                <div class="flex items-center justify-between mt-3">
                    <div>
                        <span class={rowLabel}>{$t('settings.zen')}</span>
                        <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] mt-0.5">
                            {$t('settings.zen.desc')}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button
                            onclick={() => zenMode.set(false)}
                            class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                                ${!$zenMode
                                    ? 'bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400'
                                    : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                        >
                            {$t('common.disabled')}
                        </button>
                        <button
                            onclick={() => zenMode.set(true)}
                            class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                                ${$zenMode
                                    ? 'bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400'
                                    : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                        >
                            {$t('common.enabled')}
                        </button>
                    </div>
                </div>
                <!-- Editor Tabs Opacity in Zen Mode -->
                <div class="flex items-center justify-between gap-4 mt-3">
                    <div>
                        <span class={rowLabel}>{$t('settings.zen.tabs_opacity')}</span>
                        <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] mt-0.5">
                            {$t('settings.zen.tabs_opacity.desc')}
                        </p>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                        <input
                            type="range"
                            min={ZEN_TABS_OPACITY_BOUNDS.min}
                            max={ZEN_TABS_OPACITY_BOUNDS.max}
                            step={ZEN_TABS_OPACITY_BOUNDS.step}
                            value={$zenTabsOpacity}
                            oninput={(e) => zenTabsOpacity.set(Number(e.currentTarget.value))}
                            aria-label={$t('settings.zen.tabs_opacity')}
                            class="range-slider w-32 cursor-pointer"
                        />
                        <span class="w-11 text-center text-xs font-mono text-brand-charcoal-500 dark:text-[#c6d0f5]">
                            {$zenTabsOpacity}%
                        </span>
                    </div>
                </div>
            </div>

            <!-- Accessibility -->
            <div>
                <p class={sectionLabel}>{$t('settings.accessibility')}</p>
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <span class={rowLabel}>{$t('settings.accessibility.ui_font')}</span>
                        <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] mt-0.5">
                            {$t('settings.accessibility.ui_font.desc')}
                        </p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <button
                            onclick={decUiFontScale}
                            disabled={$uiFontScale <= UI_FONT_SCALE_BOUNDS.min}
                            class={stepBtn}
                            aria-label={$t('settings.accessibility.ui_font.decrease')}
                            title={$t('settings.accessibility.ui_font.decrease')}
                        >
                            <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
                                <line x1="0" y1="1" x2="10" y2="1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </button>
                        <span class="w-11 text-center text-xs font-mono text-brand-charcoal-500 dark:text-[#c6d0f5]">
                            {Math.round($uiFontScale * 100)}%
                        </span>
                        <button
                            onclick={incUiFontScale}
                            disabled={$uiFontScale >= UI_FONT_SCALE_BOUNDS.max}
                            class={stepBtn}
                            aria-label={$t('settings.accessibility.ui_font.increase')}
                            title={$t('settings.accessibility.ui_font.increase')}
                        >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <line x1="5" y1="0" x2="5" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </button>
                        <button
                            onclick={resetUiFontScale}
                            disabled={$uiFontScale === UI_FONT_SCALE_BOUNDS.default}
                            class="{actionBtn} disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {$t('settings.accessibility.ui_font.reset')}
                        </button>
                    </div>
                </div>
            </div>

            </div>
        </section>

        <!-- ═══════════════ GROUP: Editor & Writing ═══════════════ -->
        <section class="py-3 border-t border-slate-100 dark:border-[#414559]">
            <div class="flex items-center gap-2 pb-2.5 mb-3 border-b border-brand-gold-200/60 dark:border-[#414559]">
                <Icon icon="solar:pen-new-square-bold-duotone" class="text-brand-gold-400" width="1rem" />
                <h3 class={groupTitle}>{$t('settings.group.editor')}</h3>
            </div>
            <div class="space-y-4">

            <!-- Code Editor -->
            <div>
                <p class={sectionLabel}>Code Editor</p>
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <span class={rowLabel}>Tab size</span>
                        <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] mt-0.5">
                            Number of spaces inserted per indent level.
                        </p>
                    </div>
                    <div class="relative shrink-0">
                        <select
                            value={String($editorIndentSize)}
                            onchange={(e) =>
                                editorIndentSize.set(
                                    e.currentTarget.value === '4' ? 4 : 2,
                                )}
                            class="appearance-none cursor-pointer rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-3 py-1.5 pr-8 text-xs text-brand-charcoal-500 dark:text-[#c6d0f5] transition-all focus:border-brand-gold-400 dark:focus:border-[#e5c890] focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20 hover:border-brand-sand-400 dark:hover:border-[#626880] hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]"
                        >
                            <option value="2">2 spaces</option>
                            <option value="4">4 spaces</option>
                        </select>
                        <span class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300">
                            <Icon icon="charm:chevron-down" width="0.75rem" />
                        </span>
                    </div>
                </div>
            </div>

            <!-- Custom Fonts -->
            <div>
                <p class={sectionLabel}>{$t('settings.custom_fonts')}</p>
                <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] mb-2">
                    {$t('settings.custom_fonts.desc')}
                </p>
                <div class="flex items-center justify-between">
                    <span class={rowLabel}>{$customFontFamilies.length} {$t('settings.custom_fonts.saved_count')}</span>
                    <button onclick={openCustomFontDialog} class={actionBtn}>
                        <Icon icon="solar:settings-bold-duotone" width="0.85rem" />
                        {$t('settings.custom_fonts.open')}
                    </button>
                </div>
            </div>

            </div>
        </section>

        <!-- ═══════════════ GROUP: AI Tools (Pro/Pro+ only — these features
             are unavailable on free accounts, so the whole group is hidden
             there too) ═══════════════ -->
        {#if $isPro}
        <section class="py-3 border-t border-slate-100 dark:border-[#414559]">
            <div class="flex items-center gap-2 pb-2.5 mb-3 border-b border-brand-gold-200/60 dark:border-[#414559]">
                <Icon icon="solar:magic-stick-3-bold-duotone" class="text-brand-gold-400" width="1rem" />
                <h3 class={groupTitle}>{$t('settings.ai_tools')}</h3>
            </div>
            <div class="space-y-4">

            <!-- Default selection model -->
            <div>
                <div class="flex items-center justify-between gap-4">
                    <div>
                        <span class={rowLabel}>{$t('settings.ai_tools.default_selection_model')}</span>
                        <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] mt-0.5">
                            {$t('settings.ai_tools.default_selection_model.desc')}
                        </p>
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <button
                            onclick={() => aiTextDefaultModel.set('standard')}
                            class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                                ${effTextModel === 'standard'
                                    ? 'bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400'
                                    : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                        >
                            {$t('ai_chat.model_standard')}
                        </button>
                        <button
                            onclick={() => aiTextDefaultModel.set('advanced')}
                            class={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                                ${effTextModel === 'advanced'
                                    ? 'bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400'
                                    : 'cursor-pointer border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                        >
                            {$t('ai_chat.model_advanced')}
                        </button>
                    </div>
                </div>
            </div>

            </div>
        </section>
        {/if}

        <!-- ═══════════════ GROUP: Environments ═══════════════ -->
        <section class="py-3 border-t border-slate-100 dark:border-[#414559]">
            <div class="flex items-center gap-2 pb-2.5 mb-3 border-b border-brand-gold-200/60 dark:border-[#414559]">
                <Icon icon="solar:code-square-bold-duotone" class="text-brand-gold-400" width="1rem" />
                <h3 class={groupTitle}>{$t('settings.group.environments')}</h3>
            </div>
            <div class="space-y-4">

            <!-- Julia -->
            <div>
                <p class={sectionLabel}>Julia</p>
                <div class="flex items-center justify-between mb-2">
                <span class={rowLabel}>
                    {$t('settings.julia.installed')}
                    {#if $juliaInstalledVersion}
                        <span class="ml-1 font-mono text-brand-charcoal-500 dark:text-[#c6d0f5]">{$juliaInstalledVersion}</span>
                    {:else}
                        <span class="ml-1 text-brand-charcoal-300 dark:text-[#838ba7]">{$t('settings.julia.not_installed')}</span>
                    {/if}
                </span>
                <button
                    onclick={checkJuliaVersion}
                    disabled={$juliaInstallState === 'checking' || $juliaInstallState === 'updating'}
                    class={actionBtn}
                >
                    {#if $juliaInstallState === 'checking'}
                        <Icon icon="solar:refresh-bold-duotone" width="0.85rem" class="essential-status-spinner animate-spin" />
                        {$t('settings.julia.checking')}
                    {:else}
                        <Icon icon="solar:refresh-bold-duotone" width="0.85rem" />
                        {$t('settings.julia.check')}
                    {/if}
                </button>
            </div>

            {#if $juliaInstallState === 'updating'}
                <div class="mt-2 mb-2 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/70 dark:bg-[#292c3c] px-3 py-2.5">
                    <div class="flex items-center gap-2 text-xs text-brand-charcoal-500 dark:text-[#c6d0f5]">
                        <Icon icon="solar:refresh-bold-duotone" width="0.85rem" class="essential-status-spinner animate-spin shrink-0 text-brand-gold-500 dark:text-[#e5c890]" />
                        <span class="truncate">{$juliaInstallMessage || $t('settings.julia.updating')}</span>
                    </div>
                    <IndeterminateProgress class="mt-2" ariaLabel={$t('settings.julia.updating')} />
                    <p class="mt-2 text-xs text-brand-charcoal-300 dark:text-[#838ba7]">
                        {$t('settings.julia.background_hint')}
                    </p>
                </div>
            {/if}

            {#if $juliaLatestVersion && $juliaInstalledVersion}
                <div class="flex items-center justify-between mt-1">
                    <span class={rowLabel}>
                        {$t('settings.julia.latest')}
                        <span class="ml-1 font-mono text-brand-charcoal-500 dark:text-[#c6d0f5]">{$juliaLatestVersion}</span>
                    </span>
                    {#if isNewer($juliaLatestVersion, $juliaInstalledVersion)}
                        <button
                            onclick={updateJulia}
                            disabled={$juliaInstallState === 'updating'}
                            class={actionBtn}
                        >
                            <Icon icon="solar:upload-bold-duotone" width="0.85rem" />
                            {$t('settings.julia.update')}
                        </button>
                    {:else}
                        <span class="text-xs text-brand-charcoal-300 dark:text-[#838ba7]">{$t('settings.julia.up_to_date')}</span>
                    {/if}
                </div>
            {/if}

            <!-- Switch to a specific Julia version -->
            <div class="mt-3">
                <div class="flex items-start justify-between gap-3 mb-1">
                    <div class="min-w-0">
                        <span class={rowLabel}>Switch version</span>
                        <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] mt-0.5">
                            Install and switch the default to a specific Julia version (e.g. <span class="font-mono">1.10.4</span>). Useful for downgrading.
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <input
                        type="text"
                        inputmode="decimal"
                        spellcheck={false}
                        placeholder="e.g. 1.10.4"
                        bind:value={juliaTargetVersion}
                        onkeydown={(e) => { if (e.key === 'Enter') setJuliaVersion(); }}
                        disabled={$juliaInstallState === 'updating'}
                        class="flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-3 py-1.5 text-xs font-mono text-brand-charcoal-500 dark:text-[#c6d0f5] placeholder:text-brand-charcoal-300 dark:placeholder:text-[#626880] transition-all focus:border-brand-gold-400 dark:focus:border-[#e5c890] focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <button
                        onclick={setJuliaVersion}
                        disabled={$juliaInstallState === 'updating' || !juliaTargetVersion.trim()}
                        class="{actionBtn} disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Icon icon="solar:download-bold-duotone" width="0.85rem" />
                        Switch
                    </button>
                </div>
            </div>

            {#if $juliaInstallState === 'error'}
                <p class="mt-1 text-xs text-red-500 dark:text-red-400 break-all">{$juliaInstallError}</p>
            {/if}
        </div>

            <!-- Lean 4 -->
            <div class="pt-4 border-t border-slate-100 dark:border-[#414559]">
                <p class={sectionLabel}>Lean 4</p>
                <div class="flex items-center justify-between mb-2">
                <span class={rowLabel}>
                    {$t('settings.lean.installed')}
                    {#if $leanInstalledVersion}
                        <span class="ml-1 font-mono text-brand-charcoal-500 dark:text-[#c6d0f5]">{$leanInstalledVersion}</span>
                    {:else}
                        <span class="ml-1 text-brand-charcoal-300 dark:text-[#838ba7]">{$t('settings.lean.not_installed')}</span>
                    {/if}
                </span>
                <button
                    onclick={checkLeanVersion}
                    disabled={$leanInstallState === 'checking' || $leanInstallState === 'updating'}
                    class={actionBtn}
                >
                    {#if $leanInstallState === 'checking'}
                        <Icon icon="solar:refresh-bold-duotone" width="0.85rem" class="essential-status-spinner animate-spin" />
                        {$t('settings.lean.checking')}
                    {:else}
                        <Icon icon="solar:refresh-bold-duotone" width="0.85rem" />
                        {$t('settings.lean.check')}
                    {/if}
                </button>
            </div>

            {#if $leanInstallState === 'updating'}
                <div class="mt-2 mb-2 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/70 dark:bg-[#292c3c] px-3 py-2.5">
                    <div class="flex items-center gap-2 text-xs text-brand-charcoal-500 dark:text-[#c6d0f5]">
                        <Icon icon="solar:refresh-bold-duotone" width="0.85rem" class="essential-status-spinner animate-spin shrink-0 text-brand-gold-500 dark:text-[#e5c890]" />
                        <span class="truncate">{$leanInstallMessage || $t('settings.lean.updating')}</span>
                    </div>
                    <IndeterminateProgress class="mt-2" ariaLabel={$t('settings.lean.updating')} />
                    <p class="mt-2 text-xs text-brand-charcoal-300 dark:text-[#838ba7]">
                        {$t('settings.lean.background_hint')}
                    </p>
                </div>
            {/if}

            {#if $leanLatestVersion && $leanInstalledVersion}
                <div class="flex items-center justify-between mt-1">
                    <span class={rowLabel}>
                        {$t('settings.lean.latest')}
                        <span class="ml-1 font-mono text-brand-charcoal-500 dark:text-[#c6d0f5]">{$leanLatestVersion}</span>
                    </span>
                    {#if isNewer($leanLatestVersion, $leanInstalledVersion)}
                        <button
                            onclick={updateLean}
                            disabled={$leanInstallState === 'updating'}
                            class={actionBtn}
                        >
                            <Icon icon="solar:upload-bold-duotone" width="0.85rem" />
                            {$t('settings.lean.update')}
                        </button>
                    {:else}
                        <span class="text-xs text-brand-charcoal-300 dark:text-[#838ba7]">{$t('settings.lean.up_to_date')}</span>
                    {/if}
                </div>
            {/if}

            <!-- Switch to a specific Lean toolchain -->
            <div class="mt-3">
                <div class="flex items-start justify-between gap-3 mb-1">
                    <div class="min-w-0">
                        <span class={rowLabel}>Switch toolchain</span>
                        <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7] mt-0.5">
                            Install and switch the default to a specific Lean toolchain (e.g. <span class="font-mono">4.15.0</span>, <span class="font-mono">stable</span> or <span class="font-mono">nightly</span>).
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <input
                        type="text"
                        spellcheck={false}
                        placeholder="e.g. 4.15.0"
                        bind:value={leanTargetVersion}
                        onkeydown={(e) => { if (e.key === 'Enter') setLeanVersion(); }}
                        disabled={$leanInstallState === 'updating'}
                        class="flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-3 py-1.5 text-xs font-mono text-brand-charcoal-500 dark:text-[#c6d0f5] placeholder:text-brand-charcoal-300 dark:placeholder:text-[#626880] transition-all focus:border-brand-gold-400 dark:focus:border-[#e5c890] focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <button
                        onclick={setLeanVersion}
                        disabled={$leanInstallState === 'updating' || !leanTargetVersion.trim()}
                        class="{actionBtn} disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Icon icon="solar:download-bold-duotone" width="0.85rem" />
                        Switch
                    </button>
                </div>
            </div>

            {#if $leanInstallState === 'error'}
                <p class="mt-1 text-xs text-red-500 dark:text-red-400 break-all">{$leanInstallError}</p>
            {/if}
        </div>

            <!-- Typst Packages -->
            <div class="pt-4 border-t border-slate-100 dark:border-[#414559]">
                <p class={sectionLabel}>{$t('settings.typst')}</p>
            <p class="mb-2 text-xs text-brand-charcoal-300 dark:text-[#838ba7]">
                Default packages for the Typst editor. Downloaded automatically on first use and cached locally.
            </p>
            <div class="flex items-center justify-between mb-2">
                <div>
                    <span class={rowLabel}>ilm
                        <span class="ml-1 font-mono text-brand-charcoal-300 dark:text-[#838ba7]">v1.4.2</span>
                    </span>
                    <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7]">Book &amp; document format</p>
                </div>
                <button
                    onclick={() => openUrl('https://github.com/talal/ilm')}
                    class={actionBtn}
                >
                    <Icon icon="solar:arrow-right-up-bold-duotone" width="0.85rem" />
                    GitHub
                </button>
            </div>
            <div class="flex items-center justify-between">
                <div>
                    <span class={rowLabel}>diatypst
                        <span class="ml-1 font-mono text-brand-charcoal-300 dark:text-[#838ba7]">v0.9.1</span>
                    </span>
                    <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7]">Presentation format</p>
                </div>
                <button
                    onclick={() => openUrl('https://github.com/skriptum/Diatypst')}
                    class={actionBtn}
                >
                    <Icon icon="solar:arrow-right-up-bold-duotone" width="0.85rem" />
                    GitHub
                </button>
                </div>
            </div>

            </div>
        </section>

        <!-- ═══════════════ GROUP: Storage ═══════════════ -->
        <section class="py-3 border-t border-slate-100 dark:border-[#414559]">
            <div class="flex items-center gap-2 pb-2.5 mb-3 border-b border-brand-gold-200/60 dark:border-[#414559]">
                <Icon icon="solar:database-bold-duotone" class="text-brand-gold-400" width="1rem" />
                <h3 class={groupTitle}>{$t('settings.group.storage')}</h3>
            </div>
            <div class="space-y-4">

            <!-- Manuscripts -->
            <div>
                <p class={sectionLabel}>{$t('settings.manuscripts')}</p>
                <div class="flex items-center justify-between">
                    <span class={rowLabel}>
                        {$t('settings.manuscripts.cache')}
                        {#if manuscriptCacheSize !== null}
                            <span class="ml-1 font-mono text-brand-charcoal-300 dark:text-[#838ba7]">{manuscriptCacheSize}</span>
                        {/if}
                    </span>
                    <button
                        onclick={async () => { await invoke('clear_manuscript_cache'); await refreshCacheSize(); }}
                        class={actionBtn}
                    >
                        <Icon icon="solar:trash-bin-trash-bold-duotone" width="0.85rem" />
                        {$t('settings.manuscripts.clear')}
                    </button>
                </div>
            </div>

            </div>
        </section>

        <!-- ═══════════════ GROUP: App & Support ═══════════════ -->
        <section class="py-3 border-t border-slate-100 dark:border-[#414559]">
            <div class="flex items-center gap-2 pb-2.5 mb-3 border-b border-brand-gold-200/60 dark:border-[#414559]">
                <Icon icon="solar:info-circle-bold-duotone" class="text-brand-gold-400" width="1rem" />
                <h3 class={groupTitle}>{$t('settings.group.about')}</h3>
            </div>
            <div class="space-y-4">

            <!-- Help -->
            <div>
                <p class={sectionLabel}>{$t('settings.help')}</p>
                <div class="flex items-center justify-between">
                    <span class={rowLabel}>{$t('settings.help.browse')}</span>
                    <button onclick={() => openUrl('https://www.ayahlab.com/docs')} class={actionBtn}>
                        <Icon icon="solar:question-circle-bold-duotone" width="0.85rem" />
                        {$t('settings.help.open')}
                    </button>
                </div>
            </div>

            <!-- Tutorial -->
            <div>
                <p class={sectionLabel}>{$t('settings.tutorial')}</p>
                <div class="flex items-center justify-between">
                    <span class={rowLabel}>{$t('settings.tutorial.desc')}</span>
                    <button onclick={handleRestartTour} class={actionBtn}>
                        <Icon icon="solar:play-circle-bold-duotone" width="0.85rem" />
                        {$t('settings.tutorial.restart')}
                    </button>
                </div>
            </div>

            <!-- Keyboard Shortcuts -->
            <div>
                <p class={sectionLabel}>{$t('settings.shortcuts')}</p>
                <div class="flex items-center justify-between">
                    <span class={rowLabel}>{$t('settings.shortcuts.desc')}</span>
                    <button onclick={() => (showShortcuts = true)} class={actionBtn}>
                        <Icon icon="solar:keyboard-bold-duotone" width="0.85rem" />
                        {$t('settings.shortcuts.open')}
                    </button>
                </div>
            </div>

            <!-- Updates / Website -->
            <div>
                <p class={sectionLabel}>{$t('settings.website')}</p>

            <!-- Row 1: current version + check button -->
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                    <Icon icon="solar:global-bold-duotone" class="text-brand-gold-400" width="0.9rem" />
                    <span class={rowLabel}>
                        ayahlab.com
                        {#if appVersion}
                            <span class="ml-1 font-mono text-brand-charcoal-300 dark:text-[#838ba7]">v{appVersion}</span>
                        {/if}
                    </span>
                </div>
                <button
                    class={actionBtn}
                    disabled={appCheckState === 'checking'}
                    onclick={async () => {
                        appCheckState = 'checking';
                        appCheckError = '';
                        latestAppVersion = null;
                        try {
                            latestAppVersion = await invoke<string>('get_latest_ayahlab_version');
                            appCheckState = 'idle';
                        } catch (e) {
                            appCheckError = String(e).slice(0, 180);
                            appCheckState = 'error';
                        }
                    }}
                >
                    {#if appCheckState === 'checking'}
                        <Icon icon="solar:refresh-bold-duotone" width="0.85rem" class="animate-spin" />
                        {$t('settings.julia.checking')}
                    {:else}
                        <Icon icon="solar:refresh-bold-duotone" width="0.85rem" />
                        {$t('settings.julia.check')}
                    {/if}
                </button>
            </div>

            <!-- Row 2: latest version result + action -->
            {#if latestAppVersion && appVersion}
                <div class="flex items-center justify-between mt-1">
                    <span class={rowLabel}>
                        {$t('settings.julia.latest')}
                        <span class="ml-1 font-mono text-brand-charcoal-500 dark:text-[#c6d0f5]">v{latestAppVersion}</span>
                    </span>
                    {#if isNewer(latestAppVersion, appVersion)}
                        <button class={actionBtn} onclick={() => openUrl('https://www.ayahlab.com/')}>
                            <Icon icon="solar:download-bold-duotone" width="0.85rem" />
                            {$t('settings.website.download')}
                        </button>
                    {:else}
                        <span class="text-xs text-brand-charcoal-300 dark:text-[#838ba7]">{$t('settings.website.up_to_date')}</span>
                    {/if}
                </div>
            {/if}

            <!-- Error display -->
            {#if appCheckState === 'error'}
                <p class="mt-1 text-xs text-red-500 dark:text-red-400 break-all">{appCheckError}</p>
            {/if}
        </div>

            <!-- Privacy -->
            <div>
                <p class={sectionLabel}>{$t('settings.privacy')}</p>
                <div class="flex items-start gap-2 rounded-lg bg-brand-sand-50 dark:bg-[#292c3c] border border-brand-sand-100 dark:border-[#414559] px-3 py-2.5">
                    <Icon icon="solar:shield-check-bold-duotone" class="text-brand-gold-400 shrink-0 mt-0.5" width="0.9rem" />
                    <p class="text-xs text-brand-charcoal-500 dark:text-[#838ba7] leading-relaxed">
                        {$isPro ? $t('settings.privacy.text_pro') : $t('settings.privacy.text')}
                    </p>
                </div>
            </div>

            </div>
        </section>

        </div>
    {/snippet}
</Dialog>

<ShortcutsDialog open={showShortcuts} onClose={() => (showShortcuts = false)} />
