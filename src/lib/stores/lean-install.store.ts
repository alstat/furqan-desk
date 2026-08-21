/**
 * Lean 4 toolchain install/update state.
 *
 * Lean is not shipped inside the app bundle — it is fetched on demand through
 * elan (Lean's version manager) into the app's own data directory. This store
 * owns the "is it there / install it / update it" lifecycle and the dialog
 * visibility, so an install that takes minutes keeps running even if the user
 * closes the prompt. Mirrors `julia-install.store.ts`.
 */
import { writable, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type LeanInstallState = 'idle' | 'checking' | 'updating' | 'error';

export const leanInstalledVersion = writable<string | null>(null);
export const leanLatestVersion    = writable<string | null>(null);
export const leanInstallState     = writable<LeanInstallState>('idle');
export const leanInstallError     = writable<string>('');
export const leanInstallMessage   = writable<string>('');

/** Controls the "Lean is not installed" prompt, shown when a compile is
 *  attempted (or a .lean file created) without a Lean toolchain available.
 *  See LeanInstallPrompt.svelte. */
export const leanPromptOpen = writable(false);

/** True while the Settings dialog is open. The background install toast
 *  (LeanInstallToast.svelte) suppresses itself when either the settings dialog
 *  or the install prompt is already visible, so progress isn't shown twice. */
export const leanSettingsOpen = writable(false);

export function openLeanInstallPrompt(): void {
    leanPromptOpen.set(true);
}

/**
 * Close the prompt. Unlike Julia's, this never refuses: the install is owned by
 * this module rather than by the dialog, so dismissing the prompt hands an
 * in-flight download off to the background toast instead of cancelling it.
 */
export function closeLeanInstallPrompt(): void {
    leanPromptOpen.set(false);
}

/**
 * Offer to install Lean, at most once per session.
 *
 * Called when a .lean file is created or opened. Declining must not block the
 * file — the editor is already mounted behind the dialog — and must not nag on
 * every later tab switch, so the offer is gated. The gate is claimed
 * synchronously because a split view mounts several Lean editors at once and
 * they would otherwise race past the `await` together.
 */
let _offerGate = false;
export async function maybeOfferLeanInstall(): Promise<void> {
    if (_offerGate) return;
    _offerGate = true;
    if (isLeanInstallRunning()) return;
    if (await isLeanInstalled()) return;
    leanPromptOpen.set(true);
}

let _unlisten: UnlistenFn | null = null;
let _listenerPromise: Promise<void> | null = null;

async function ensureProgressListener(): Promise<void> {
    if (_unlisten || _listenerPromise) return _listenerPromise ?? undefined;
    _listenerPromise = (async () => {
        _unlisten = await listen<{ message: string }>('lean-install-progress', (e) => {
            leanInstallMessage.set(e.payload.message);
        });
    })();
    return _listenerPromise;
}

let _initialized = false;
export async function initLeanInstallStore(): Promise<void> {
    await ensureProgressListener();
    if (_initialized) return;
    _initialized = true;
    try {
        leanInstalledVersion.set(await invoke<string>('get_lean_version'));
    } catch {
        // Not installed yet — the prompt handles that path.
    }
}

/**
 * Whether a Lean toolchain is available right now.
 *
 * Called before every compile, including each tick of live mode, so the answer
 * is remembered once it is affirmative: a toolchain that exists does not stop
 * existing during a session under any normal use, and if it somehow does the
 * compile itself reports it. A negative is never cached — that is the state the
 * user is actively trying to change by installing.
 */
let _knownInstalled = false;

export async function isLeanInstalled(): Promise<boolean> {
    if (_knownInstalled) return true;
    try {
        const installed = (await invoke<string>('check_lean')) === 'installed';
        if (installed) _knownInstalled = true;
        return installed;
    } catch {
        return false;
    }
}

export async function checkLeanVersion(): Promise<void> {
    if (get(leanInstallState) === 'updating') return;
    leanInstallState.set('checking');
    leanInstallError.set('');
    leanLatestVersion.set(null);
    try {
        leanInstalledVersion.set(await invoke<string>('get_lean_version'));
        leanLatestVersion.set(await invoke<string>('get_latest_lean_version'));
        leanInstallState.set('idle');
    } catch (e) {
        leanInstallError.set(String(e).slice(0, 180));
        leanInstallState.set('error');
    }
}

let _runningInstall: Promise<void> | null = null;

/** Fresh install of Lean (via elan). Emits progress on 'lean-install-progress'. */
export function installLean(): Promise<void> {
    if (_runningInstall) return _runningInstall;
    _runningInstall = (async () => {
        await ensureProgressListener();
        leanInstallState.set('updating');
        leanInstallError.set('');
        leanInstallMessage.set('');
        try {
            await invoke('install_lean');
            _knownInstalled = true;
            try {
                leanInstalledVersion.set(await invoke<string>('get_lean_version'));
            } catch {
                // Installed, but the version probe failed — not worth failing on.
            }
            leanInstallState.set('idle');
        } catch (e) {
            leanInstallError.set(String(e).slice(0, 220));
            leanInstallState.set('error');
            throw e;
        } finally {
            _runningInstall = null;
        }
    })();
    return _runningInstall;
}

/** Move the managed toolchain to the newest stable Lean release. */
export function updateLean(): Promise<void> {
    if (_runningInstall) return _runningInstall;
    _runningInstall = (async () => {
        await ensureProgressListener();
        leanInstallState.set('updating');
        leanInstallError.set('');
        leanInstallMessage.set('');
        try {
            await invoke('update_lean');
            leanInstalledVersion.set(await invoke<string>('get_lean_version'));
            leanInstallState.set('idle');
        } catch (e) {
            leanInstallError.set(String(e).slice(0, 220));
            leanInstallState.set('error');
        } finally {
            _runningInstall = null;
        }
    })();
    return _runningInstall;
}

export function isValidLeanVersion(v: string): boolean {
    // Either a plain release (4.15.0) or an elan toolchain name
    // (leanprover/lean4:v4.15.0, stable, nightly).
    const t = v.trim();
    return (
        /^\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.]+)?$/.test(t) ||
        /^(stable|nightly)$/.test(t) ||
        /^[\w.-]+\/[\w.-]+:[\w.-]+$/.test(t)
    );
}

/** Pin the managed install to a specific toolchain. */
export function setLeanVersion(version: string): Promise<void> {
    if (_runningInstall) return _runningInstall;
    const target = version.trim().replace(/^v(?=\d)/i, '');
    if (!isValidLeanVersion(target)) {
        leanInstallError.set('Enter a version like 4.15.0, or stable / nightly');
        leanInstallState.set('error');
        return Promise.resolve();
    }
    _runningInstall = (async () => {
        await ensureProgressListener();
        leanInstallState.set('updating');
        leanInstallError.set('');
        leanInstallMessage.set('');
        try {
            await invoke('set_lean_toolchain', { version: target });
            leanInstalledVersion.set(await invoke<string>('get_lean_version'));
            leanInstallState.set('idle');
        } catch (e) {
            leanInstallError.set(String(e).slice(0, 220));
            leanInstallState.set('error');
        } finally {
            _runningInstall = null;
        }
    })();
    return _runningInstall;
}

export function isLeanInstallRunning(): boolean {
    return _runningInstall !== null;
}
