<script lang="ts">
	import '../app.css';
	import '$lib/icons';
	import { appDarkMode, zenMode, uiFontScale } from '$lib/stores/editor.store';
	import AppHeader from '$lib/components/shared/AppHeader.svelte';
	import OpenTabFileWatcher from '$lib/components/shared/OpenTabFileWatcher.svelte';
	import JuliaInstallPrompt from '$lib/components/shared/JuliaInstallPrompt.svelte';
	import LeanInstallPrompt from '$lib/components/shared/LeanInstallPrompt.svelte';
	import LeanInstallToast from '$lib/components/shared/LeanInstallToast.svelte';
	import JuliaInstallToast from '$lib/components/shared/JuliaInstallToast.svelte';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { tabs } from '$lib/stores/tabs.store';
	import { t as i18n } from '$lib/i18n';
	import { supabase, isSupabaseConfigured } from '$lib/supabase';
	import { openFile, openFolder, saveFile, saveAs } from '$lib/actions/fileActions';
	import { windowMaximized } from '$lib/stores/window-state.store';
	import { page } from '$app/state';

	let { children } = $props();

	// Secondary windows (the postcard editor, the manuscript viewer) render
	// their route and nothing else: no app header, no file watcher, no install
	// prompts, and none of the main window's menu/deep-link/close-confirm
	// wiring, which all belongs to the one window that owns the documents.
	const SECONDARY_ROUTES = [
		'/postcard',
		'/manuscripts',
		'/ai-chat',
		'/terminal',
		'/julia-plots',
		'/translation',
		'/tafsir',
		'/drawing'
	];
	const isSecondaryWindow = $derived(
		SECONDARY_ROUTES.some((route) => page.url.pathname.startsWith(route))
	);

	// Linux runs the window undecorated so the header can be the title bar (see
	// AppHeader), which also means GTK draws no window frame. The app supplies
	// one itself — see the client-side-decorations block in app.css. Android
	// also reports "Linux" and has no window frame to draw.
	const isLinuxCsd =
		typeof navigator !== 'undefined' &&
		navigator.userAgent.includes('Linux') &&
		!navigator.userAgent.includes('Android');

	// Rounding the corners only works while the window can actually be
	// transparent. On WebKit's software-composited fallback it cannot, and the
	// area outside the radius renders black — worse than square corners — so ask
	// the backend which path we are on and drop the radius if it is that one.
	let softwareCompositing = $state(false);
	onMount(async () => {
		try {
			const { invoke } = await import('@tauri-apps/api/core');
			softwareCompositing = await invoke('software_compositing');
		} catch {
			// not running inside Tauri (e.g. browser dev)
		}
	});

	// Completes the Google OAuth flow: the system browser redirects back to our
	// `ayahlab://auth-callback?code=…` custom scheme, the deep-link plugin hands
	// us that URL, and we exchange the code for a session. onAuthStateChange
	// (in auth.store) then swaps the login view out automatically.
	async function handleAuthDeepLink(urls: string[] | null) {
		if (!urls || !isSupabaseConfigured) return;
		for (const raw of urls) {
			let parsed: URL;
			try {
				parsed = new URL(raw);
			} catch {
				continue;
			}
			if (parsed.host !== 'auth-callback') continue;
			const code = parsed.searchParams.get('code');
			if (!code) continue;
			const { error } = await supabase.auth.exchangeCodeForSession(code);
			if (error) console.error('OAuth code exchange failed', error);
			return;
		}
	}

	$effect(() => {
		if ($appDarkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	});

	$effect(() => {
		const root = document.documentElement;
		root.classList.toggle('linux-csd', isLinuxCsd);
		// Corners only while the window floats; flush against the screen edge
		// GNOME squares its own off too.
		root.classList.toggle(
			'csd-round',
			isLinuxCsd && !$windowMaximized && !softwareCompositing
		);
	});

	$effect(() => {
		if ($zenMode) {
			document.documentElement.classList.add('zen');
		} else {
			document.documentElement.classList.remove('zen');
		}
	});

	// Accessibility: scale the whole interface by adjusting the root font-size.
	// A percentage on :root is relative to the browser default (16px), so every
	// rem-based size in the UI scales proportionally. vh-based layout (h-screen)
	// is unaffected, so the app frame stays put while its contents resize.
	$effect(() => {
		document.documentElement.style.fontSize = `${$uiFontScale * 100}%`;
	});

	onMount(async () => {
		if (typeof window === 'undefined') return;
		if (isSecondaryWindow) return;
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const { ask } = await import('@tauri-apps/plugin-dialog');

			// Native menu (File > Open File / Open Folder / Save / Save As) emits
			// these events; run the same actions as the action-bar buttons.
			try {
				const { listen } = await import('@tauri-apps/api/event');
				await listen('menu-open-file', () => void openFile());
				await listen('menu-open-folder', () => void openFolder());
				await listen('menu-save', () => void saveFile());
				await listen('menu-save-as', () => void saveAs());
			} catch (e) {
				console.error('menu listener setup failed', e);
			}

			// On Windows/Linux the menu bar is hidden (lib.rs), and a hidden
			// menu no longer delivers its accelerators there — only macOS keeps
			// them via the system menu bar. Recreate the File shortcuts with a
			// window-level keydown handler routed to the same actions. macOS is
			// excluded so Cmd shortcuts aren't double-handled by menu + DOM.
			const isMac = navigator.userAgent.includes('Mac');
			if (!isMac) {
				window.addEventListener(
					'keydown',
					(e) => {
						if (!e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
						const key = e.key.toLowerCase();
						if (key !== 's' && key !== 'o') return;
						e.preventDefault();
						if (key === 's') void (e.shiftKey ? saveAs() : saveFile());
						else void (e.shiftKey ? openFolder() : openFile());
					},
					true
				);
			}

			// OAuth deep-link handling: catch both a URL that cold-started the
			// app and any delivered while it's already running.
			try {
				const deepLink = await import('@tauri-apps/plugin-deep-link');
				await handleAuthDeepLink(await deepLink.getCurrent());
				await deepLink.onOpenUrl((urls) => void handleAuthDeepLink(urls));
			} catch (e) {
				console.error('deep-link setup failed', e);
			}

			const appWindow = getCurrentWindow();
			await appWindow.onCloseRequested(async (event) => {
				const dirtyTabs = get(tabs).filter(t => t.isDirty);
				if (dirtyTabs.length === 0) return;
				event.preventDefault();
				const translate = get(i18n);
				const names = dirtyTabs.map(tab => `• ${tab.name}`).join('\n');
				const message = translate('layout.unsaved_message', { names });
				// This runs long after onMount's try/catch has returned, so it
				// needs its own: a rejection here leaves the window refusing to
				// close with nothing but an unhandled rejection to show for it.
				// The webview's own confirm() is the fallback so unsaved work
				// still can't be discarded silently.
				let confirmed: boolean;
				try {
					confirmed = await ask(message, {
						title: translate('layout.unsaved_title'),
						kind: 'warning',
						okLabel: translate('layout.discard_close'),
						cancelLabel: translate('common.cancel')
					});
				} catch (e) {
					console.error('unsaved-changes dialog failed', e);
					confirmed = window.confirm(message);
				}
				if (confirmed) await appWindow.destroy();
			});
		} catch {
			// not running inside Tauri (e.g. browser dev), ignore
		}
	});
</script>

{#if isSecondaryWindow}
	{@render children()}
{:else}
	<div class="app-shell bg-gradient-radial flex h-screen flex-col overflow-hidden">
		<OpenTabFileWatcher />
		<AppHeader />
		<div class="min-h-0 flex-1">
			{@render children()}
		</div>
	</div>

	<JuliaInstallPrompt />
	<JuliaInstallToast />
	<LeanInstallPrompt />
	<LeanInstallToast />
{/if}

<style>

</style>
