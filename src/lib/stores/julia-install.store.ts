import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type JuliaInstallState = 'idle' | 'checking' | 'updating' | 'error';

export const juliaInstalledVersion = writable<string | null>(null);
export const juliaLatestVersion    = writable<string | null>(null);
export const juliaInstallState     = writable<JuliaInstallState>('idle');
export const juliaInstallError     = writable<string>('');
export const juliaInstallMessage   = writable<string>('');

/** Controls the "Julia is not installed" prompt shown when a run is attempted
 *  without a Julia binary available. See JuliaInstallPrompt.svelte. */
export const juliaPromptOpen = writable(false);

export function openJuliaInstallPrompt(): void {
    juliaPromptOpen.set(true);
}

export function closeJuliaInstallPrompt(): void {
    // Leave an in-progress install running; just hide the dialog if idle.
    if (_runningInstall) return;
    juliaPromptOpen.set(false);
}

let _unlisten: UnlistenFn | null = null;
let _listenerPromise: Promise<void> | null = null;

async function ensureProgressListener(): Promise<void> {
    if (_unlisten || _listenerPromise) return _listenerPromise ?? undefined;
    _listenerPromise = (async () => {
        _unlisten = await listen<{ message: string }>('julia-install-progress', (e) => {
            juliaInstallMessage.set(e.payload.message);
        });
    })();
    return _listenerPromise;
}

let _initialized = false;
export async function initJuliaInstallStore(): Promise<void> {
    await ensureProgressListener();
    if (_initialized) return;
    _initialized = true;
    try {
        juliaInstalledVersion.set(await invoke<string>('get_julia_version'));
    } catch {}
}

export async function checkJuliaVersion(): Promise<void> {
    if (get(juliaInstallState) === 'updating') return;
    juliaInstallState.set('checking');
    juliaInstallError.set('');
    juliaLatestVersion.set(null);
    try {
        juliaInstalledVersion.set(await invoke<string>('get_julia_version'));
        juliaLatestVersion.set(await invoke<string>('get_latest_julia_version'));
        juliaInstallState.set('idle');
    } catch (e) {
        juliaInstallError.set(String(e).slice(0, 180));
        juliaInstallState.set('error');
    }
}

let _runningInstall: Promise<void> | null = null;

export function updateJulia(): Promise<void> {
    if (_runningInstall) return _runningInstall;
    _runningInstall = (async () => {
        await ensureProgressListener();
        juliaInstallState.set('updating');
        juliaInstallError.set('');
        juliaInstallMessage.set('');
        try {
            await invoke('update_julia');
            juliaInstalledVersion.set(await invoke<string>('get_julia_version'));
            juliaInstallState.set('idle');
        } catch (e) {
            juliaInstallError.set(String(e).slice(0, 180));
            juliaInstallState.set('error');
        } finally {
            _runningInstall = null;
        }
    })();
    return _runningInstall;
}

export function isValidJuliaVersion(v: string): boolean {
    return /^\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.]+)?$/.test(v.trim());
}

export function setJuliaVersion(version: string): Promise<void> {
    if (_runningInstall) return _runningInstall;
    const target = version.trim().replace(/^v/i, '');
    if (!isValidJuliaVersion(target)) {
        juliaInstallError.set('Enter a version like 1.10 or 1.10.4');
        juliaInstallState.set('error');
        return Promise.resolve();
    }
    _runningInstall = (async () => {
        await ensureProgressListener();
        juliaInstallState.set('updating');
        juliaInstallError.set('');
        juliaInstallMessage.set('');
        try {
            await invoke('set_julia_version', { version: target });
            juliaInstalledVersion.set(await invoke<string>('get_julia_version'));
            juliaInstallState.set('idle');
        } catch (e) {
            juliaInstallError.set(String(e).slice(0, 220));
            juliaInstallState.set('error');
        } finally {
            _runningInstall = null;
        }
    })();
    return _runningInstall;
}

/** Fresh install of Julia (via juliaup) for users who don't have it yet.
 *  Used by JuliaInstallPrompt.svelte. Emits progress on 'julia-install-progress'. */
export function installJulia(): Promise<void> {
    if (_runningInstall) return _runningInstall;
    _runningInstall = (async () => {
        await ensureProgressListener();
        juliaInstallState.set('updating');
        juliaInstallError.set('');
        juliaInstallMessage.set('');
        try {
            await invoke('install_julia');
            try {
                juliaInstalledVersion.set(await invoke<string>('get_julia_version'));
            } catch {}
            juliaInstallState.set('idle');
        } catch (e) {
            juliaInstallError.set(String(e).slice(0, 220));
            juliaInstallState.set('error');
            throw e;
        } finally {
            _runningInstall = null;
        }
    })();
    return _runningInstall;
}

export function isJuliaInstallRunning(): boolean {
    return _runningInstall !== null;
}
