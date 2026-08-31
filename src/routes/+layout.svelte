<script lang="ts">
	import '../app.css';
	import '$lib/icons';
	import { appDarkMode, zenMode, uiFontScale } from '$lib/stores/editor.store';
	import AppHeader from '$lib/components/shared/AppHeader.svelte';
	import OpenTabFileWatcher from '$lib/components/shared/OpenTabFileWatcher.svelte';
	import JuliaInstallPrompt from '$lib/components/shared/JuliaInstallPrompt.svelte';
	import LeanInstallPrompt from '$lib/components/shared/LeanInstallPrompt.svelte';
	import LeanInstallToast from '$lib/components/shared/LeanInstallToast.svelte';
	import { animationsEnabled } from '$lib/stores/animations.store';
	import JuliaInstallToast from '$lib/components/shared/JuliaInstallToast.svelte';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { tabs } from '$lib/stores/tabs.store';
	import { t as i18n } from '$lib/i18n';
	import { supabase, isSupabaseConfigured } from '$lib/supabase';
	import { oauthError } from '$lib/stores/auth.store';
	import { openFile, openFolder, saveFile, saveAs } from '$lib/actions/fileActions';
	import {
		CSD_SHADOW_MARGIN_PX,
		isLinuxCsd,
		csdRound as csdRoundStore
	} from '$lib/stores/window-state.store';
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
		'/drawing',
		'/workbook',
		// Prefix match also covers '/arabic-study-home'.
		'/arabic-study'
	];
	const isSecondaryWindow = $derived(
		SECONDARY_ROUTES.some((route) => page.url.pathname.startsWith(route))
	);

	// isLinuxCsd/csdRound live in window-state.store so +page.svelte's own
	// height math (JS-measured, not CSS flex) can agree with the margin these
	// classes put on `.app-shell` — see `csdMarginPx` there.

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
			if (error) {
				console.error('OAuth code exchange failed', error);
				// Release the sign-in spinner: a release build has no console,
				// so without this the failure has no visible symptom at all.
				oauthError.set(error.message);
			}
			return;
		}
	}

	// A window opened by another one is told the theme in its URL: older macOS
	// WebKit does not reliably share localStorage between webviews, so a
	// secondary window could otherwise boot light while the app is dark.
	onMount(() => {
		const theme = new URLSearchParams(window.location.search).get('theme');
		if (theme === 'dark' || theme === 'light') appDarkMode.set(theme === 'dark');
	});

	$effect(() => {
		if ($appDarkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	});

	// Live changes reach the other windows the same way. The storage event does
	// this where localStorage is shared; the Tauri event covers where it is not.
	let broadcastTheme: boolean | null = null;
	$effect(() => {
		const dark = $appDarkMode;
		if (broadcastTheme === dark) return;
		broadcastTheme = dark;
		void (async () => {
			try {
				const { emit } = await import('@tauri-apps/api/event');
				await emit('app-theme-changed', { dark });
			} catch {
				/* not running inside Tauri */
			}
		})();
	});

	onMount(() => {
		let stop: (() => void) | undefined;
		void (async () => {
			try {
				const { listen } = await import('@tauri-apps/api/event');
				stop = await listen<{ dark: boolean }>('app-theme-changed', (event) => {
					// Record it as already broadcast, so receiving does not echo.
					broadcastTheme = event.payload.dark;
					appDarkMode.set(event.payload.dark);
				});
			} catch {
				/* not running inside Tauri */
			}
		})();
		return () => stop?.();
	});

	// Corners (and the shadow margin) only while the window floats; flush
	// against the screen edge GNOME squares its own off too. Mirrors
	// window-state.store's `csdRound`, which +page.svelte also reads.
	const csdRound = $derived($csdRoundStore);

	$effect(() => {
		const root = document.documentElement;
		root.classList.toggle('linux-csd', isLinuxCsd);
		root.classList.toggle('csd-round', csdRound);
		// Every window reserves the margin for its drop shadow — main window
		// included — so it reads the same as its dialogs. See the note on
		// `.csd-dialog` in app.css.
		root.classList.toggle('csd-dialog', isLinuxCsd);
	});

	// Cover the full transparent shadow band and continue slightly inside the
	// visible shell. This gives Linux a forgiving resize target without letting
	// the handles swallow controls positioned close to the content edge.
	type ResizeDir =
		| 'North'
		| 'South'
		| 'East'
		| 'West'
		| 'NorthEast'
		| 'NorthWest'
		| 'SouthEast'
		| 'SouthWest';

	const EDGE_HIT_PX = CSD_SHADOW_MARGIN_PX + 9;
	const CORNER_HIT_PX = CSD_SHADOW_MARGIN_PX + 13;
	const edgeInset = 0;
	const cornerInset = 0;
	const edgeEnd = cornerInset + CORNER_HIT_PX;
	const RESIZE_HANDLES: { dir: ResizeDir; cls: string; style: string }[] = [
		{
			dir: 'NorthWest',
			cls: 'cursor-nw-resize',
			style: `left:${cornerInset}px;top:${cornerInset}px;width:${CORNER_HIT_PX}px;height:${CORNER_HIT_PX}px;`
		},
		{
			dir: 'NorthEast',
			cls: 'cursor-ne-resize',
			style: `right:${cornerInset}px;top:${cornerInset}px;width:${CORNER_HIT_PX}px;height:${CORNER_HIT_PX}px;`
		},
		{
			dir: 'SouthWest',
			cls: 'cursor-sw-resize',
			style: `left:${cornerInset}px;bottom:${cornerInset}px;width:${CORNER_HIT_PX}px;height:${CORNER_HIT_PX}px;`
		},
		{
			dir: 'SouthEast',
			cls: 'cursor-se-resize',
			style: `right:${cornerInset}px;bottom:${cornerInset}px;width:${CORNER_HIT_PX}px;height:${CORNER_HIT_PX}px;`
		},
		{
			dir: 'North',
			cls: 'cursor-n-resize',
			style: `left:${edgeEnd}px;right:${edgeEnd}px;top:${edgeInset}px;height:${EDGE_HIT_PX}px;`
		},
		{
			dir: 'South',
			cls: 'cursor-s-resize',
			style: `left:${edgeEnd}px;right:${edgeEnd}px;bottom:${edgeInset}px;height:${EDGE_HIT_PX}px;`
		},
		{
			dir: 'West',
			cls: 'cursor-w-resize',
			style: `top:${edgeEnd}px;bottom:${edgeEnd}px;left:${edgeInset}px;width:${EDGE_HIT_PX}px;`
		},
		{
			dir: 'East',
			cls: 'cursor-e-resize',
			style: `top:${edgeEnd}px;bottom:${edgeEnd}px;right:${edgeInset}px;width:${EDGE_HIT_PX}px;`
		}
	];

	function startResize(e: PointerEvent, dir: ResizeDir) {
		if (e.button !== 0) return;
		e.preventDefault();
		// Invoke while the pointer is still down. Waiting on a dynamic import here
		// can miss the compositor's active drag gesture on the first attempt.
		void getCurrentWindow().startResizeDragging(dir).catch(() => {
			/* not running inside Tauri (e.g. browser dev) */
		});
	}

	// CSS half of the animation switch; the Web Animations half is installed by
	// animations.store on import.
	$effect(() => {
		document.documentElement.dataset.animations = $animationsEnabled
			? 'on'
			: 'off';
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

			// Windows and Linux get no application menu at all (see lib.rs:
			// a menu there is drawn as a bar inside every window), so nothing
			// delivers its accelerators — only macOS keeps them via the system
			// menu bar. Recreate the File shortcuts with a window-level keydown
			// handler routed to the same actions. macOS is excluded so Cmd
			// shortcuts aren't double-handled by menu + DOM.
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
	<!-- The dialog windows are undecorated on Windows and Linux exactly like the
	     main one, so they need the same shell: the Linux client-side frame (its
	     hairline border, Adwaita radius and the squaring-off when maximised)
	     hangs off `.app-shell` in app.css, and `overflow-hidden` is what trims
	     the dialog's own square corners to that radius. Each dialog fills this
	     box with `h-full w-full` rather than `h-screen`, so the frame's border
	     is not pushed off the bottom edge. -->
	<div class="app-shell flex h-screen flex-col overflow-hidden">
		{@render children()}
	</div>
{:else}
	<div class="app-shell bg-gradient-radial flex h-screen flex-col overflow-hidden">
		<OpenTabFileWatcher />
		<AppHeader />
		<div class="min-h-0 flex-1">
			{@render children()}
		</div>

		<!-- Inside the shell, not siblings of it: on Linux CSD these are
		     `position: fixed`, and .app-shell is their containing block (see
		     app.css), so nesting them here is what keeps them anchored to the
		     visible frame instead of the true window bounds. -->
		<JuliaInstallPrompt />
		<JuliaInstallToast />
		<LeanInstallPrompt />
		<LeanInstallToast />
	</div>
{/if}

{#if csdRound}
	{#each RESIZE_HANDLES as handle (handle.dir)}
		<div
			role="presentation"
			class="fixed z-50 {handle.cls}"
			style={handle.style}
			onpointerdown={(e) => startResize(e, handle.dir)}
		></div>
	{/each}
{/if}
