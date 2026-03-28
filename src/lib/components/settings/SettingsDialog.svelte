<script lang="ts">
    import Icon from '@iconify/svelte';
    import Dialog from '$lib/components/shared/Dialog.svelte';
    import { appDarkMode } from '$lib/stores/editor.store';
    import { restartTour } from '$lib/stores/tour.store';
    import { invoke } from '@tauri-apps/api/core';
    import { manuscriptsEnabled } from '$lib/stores/manuscripts.store';
    import { morphGlassEffect } from '$lib/stores/morphology.store';
    import { onMount, onDestroy } from 'svelte';
    import { listen } from '@tauri-apps/api/event';
    import { openUrl } from '@tauri-apps/plugin-opener';
    import { getVersion } from '@tauri-apps/api/app';

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

    // ── Julia version state ───────────────────────────────────────────────────
    let juliaInstalledVersion = $state<string | null>(null);
    let juliaLatestVersion    = $state<string | null>(null);
    let juliaCheckState       = $state<'idle' | 'checking' | 'updating' | 'error'>('idle');
    let juliaCheckError       = $state('');
    let juliaUpdateMessage    = $state('');

    function isNewer(latest: string, current: string): boolean {
        const parts = (v: string) => v.split('.').map(Number);
        const [la, lb, lc = 0] = parts(latest);
        const [ca, cb, cc = 0] = parts(current);
        if (la !== ca) return la > ca;
        if (lb !== cb) return lb > cb;
        return lc > cc;
    }

    async function checkJuliaVersion() {
        juliaCheckState = 'checking';
        juliaCheckError = '';
        juliaLatestVersion = null;
        try {
            juliaInstalledVersion = await invoke<string>('get_julia_version');
            juliaLatestVersion = await invoke<string>('get_latest_julia_version');
            juliaCheckState = 'idle';
        } catch (e) {
            juliaCheckError = String(e).slice(0, 180);
            juliaCheckState = 'error';
        }
    }

    async function updateJulia() {
        juliaCheckState = 'updating';
        juliaCheckError = '';
        juliaUpdateMessage = '';
        try {
            await invoke('update_julia');
            juliaInstalledVersion = await invoke<string>('get_julia_version');
            juliaCheckState = 'idle';
        } catch (e) {
            juliaCheckError = String(e).slice(0, 180);
            juliaCheckState = 'error';
        }
    }

    let _unlisten: (() => void) | null = null;

    onMount(async () => {
        try { appVersion = await getVersion(); } catch {}
        try { juliaInstalledVersion = await invoke<string>('get_julia_version'); } catch {}
        await refreshCacheSize();

        _unlisten = await listen<{ message: string }>('julia-install-progress', (e) => {
            juliaUpdateMessage = e.payload.message;
        });
    });

    onDestroy(() => {
        _unlisten?.();
    });
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

        <!-- Appearance -->
        <div class="py-2 border-t border-slate-100 dark:border-[#414559]">
            <p class={sectionLabel}>Appearance</p>
            <div class="flex items-center justify-between">
                <div>
                    <span class={rowLabel}>Morphology popover glass effect</span>
                    <p class="text-[10px] text-brand-charcoal-300 dark:text-[#838ba7] mt-0.5">
                        Disable to improve performance
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
                        Disabled
                    </button>
                    <button
                        onclick={() => morphGlassEffect.set(true)}
                        class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                            ${$morphGlassEffect
                                ? 'bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400'
                                : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                    >
                        Enabled
                    </button>
                </div>
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
                                ? 'bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400'
                                : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                    >
                        Disabled
                    </button>
                    <button
                        onclick={() => manuscriptsEnabled.set(true)}
                        class={`cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border transition-colors
                            ${$manuscriptsEnabled
                                ? 'bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400'
                                : 'border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]'}`}
                    >
                        Enabled
                    </button>
                </div>
            </div>
            <div class="flex items-center justify-between">
                <span class={rowLabel}>
                    Clear cached manuscript images
                    {#if manuscriptCacheSize !== null}
                        <span class="ml-1 font-mono text-brand-charcoal-300 dark:text-[#838ba7]">{manuscriptCacheSize}</span>
                    {/if}
                </span>
                <button
                    onclick={async () => { await invoke('clear_manuscript_cache'); await refreshCacheSize(); }}
                    class={actionBtn}
                >
                    <Icon icon="solar:trash-bin-trash-bold-duotone" width="0.85rem" />
                    Clear Cache
                </button>
            </div>
        </div>

        <!-- Julia -->
        <div class="py-2 border-t border-slate-100 dark:border-[#414559]">
            <p class={sectionLabel}>Julia</p>
            <div class="flex items-center justify-between mb-2">
                <span class={rowLabel}>
                    Installed version
                    {#if juliaInstalledVersion}
                        <span class="ml-1 font-mono text-brand-charcoal-500 dark:text-[#c6d0f5]">{juliaInstalledVersion}</span>
                    {:else}
                        <span class="ml-1 text-brand-charcoal-300 dark:text-[#838ba7]">Not installed</span>
                    {/if}
                </span>
                <button
                    onclick={checkJuliaVersion}
                    disabled={juliaCheckState === 'checking' || juliaCheckState === 'updating'}
                    class={actionBtn}
                >
                    {#if juliaCheckState === 'checking'}
                        <Icon icon="solar:refresh-bold-duotone" width="0.85rem" class="animate-spin" />
                        Checking…
                    {:else}
                        <Icon icon="solar:refresh-bold-duotone" width="0.85rem" />
                        Check for updates
                    {/if}
                </button>
            </div>

            {#if juliaCheckState === 'updating'}
                <div class="flex items-center gap-2 text-xs text-brand-charcoal-400 dark:text-[#838ba7] mb-1">
                    <Icon icon="solar:refresh-bold-duotone" width="0.85rem" class="animate-spin shrink-0" />
                    <span>{juliaUpdateMessage || 'Updating…'}</span>
                </div>
            {/if}

            {#if juliaLatestVersion && juliaInstalledVersion}
                <div class="flex items-center justify-between mt-1">
                    <span class={rowLabel}>
                        Latest version
                        <span class="ml-1 font-mono text-brand-charcoal-500 dark:text-[#c6d0f5]">{juliaLatestVersion}</span>
                    </span>
                    {#if isNewer(juliaLatestVersion, juliaInstalledVersion)}
                        <button
                            onclick={updateJulia}
                            disabled={juliaCheckState === 'updating'}
                            class={actionBtn}
                        >
                            <Icon icon="solar:upload-bold-duotone" width="0.85rem" />
                            Update via juliaup
                        </button>
                    {:else}
                        <span class="text-xs text-brand-charcoal-300 dark:text-[#838ba7]">Julia is up to date</span>
                    {/if}
                </div>
            {/if}

            {#if juliaCheckState === 'error'}
                <p class="mt-1 text-[11px] text-red-500 dark:text-red-400 break-all">{juliaCheckError}</p>
            {/if}
        </div>

        <!-- Website -->
        <div class="py-2 border-t border-slate-100 dark:border-[#414559]">
            <p class={sectionLabel}>Website</p>

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
                        Checking…
                    {:else}
                        <Icon icon="solar:refresh-bold-duotone" width="0.85rem" />
                        Check for updates
                    {/if}
                </button>
            </div>

            <!-- Row 2: latest version result + action -->
            {#if latestAppVersion && appVersion}
                <div class="flex items-center justify-between mt-1">
                    <span class={rowLabel}>
                        Latest version
                        <span class="ml-1 font-mono text-brand-charcoal-500 dark:text-[#c6d0f5]">v{latestAppVersion}</span>
                    </span>
                    {#if isNewer(latestAppVersion, appVersion)}
                        <button class={actionBtn} onclick={() => openUrl('https://www.ayahlab.com/')}>
                            <Icon icon="solar:download-bold-duotone" width="0.85rem" />
                            Download update
                        </button>
                    {:else}
                        <span class="text-xs text-brand-charcoal-300 dark:text-[#838ba7]">Up to date</span>
                    {/if}
                </div>
            {/if}

            <!-- Error display -->
            {#if appCheckState === 'error'}
                <p class="mt-1 text-[11px] text-red-500 dark:text-red-400 break-all">{appCheckError}</p>
            {/if}
        </div>

        <!-- Privacy -->
        <div class="py-2 border-t border-slate-100 dark:border-[#414559]">
            <p class={sectionLabel}>Privacy</p>
            <div class="flex items-start gap-2 rounded-lg bg-brand-sand-50 dark:bg-[#292c3c] border border-brand-sand-100 dark:border-[#414559] px-3 py-2.5">
                <Icon icon="solar:shield-check-bold-duotone" class="text-brand-gold-400 shrink-0 mt-0.5" width="0.9rem" />
                <p class="text-[11px] text-brand-charcoal-400 dark:text-[#838ba7] leading-relaxed">
                    AyahLab is fully offline. No accounts, no telemetry, no analytics.
                    Your notes, bookmarks, and settings stay on your device only —
                    the author has no way to access your data.
                </p>
            </div>
        </div>
    {/snippet}
</Dialog>
