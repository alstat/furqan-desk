<script lang="ts">
	import '../app.css';
	import '$lib/icons';
	import { appDarkMode, zenMode } from '$lib/stores/editor.store';
	import OpenTabFileWatcher from '$lib/components/shared/OpenTabFileWatcher.svelte';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { tabs } from '$lib/stores/tabs.store';
	import { t as i18n } from '$lib/i18n';
	import { supabase, isSupabaseConfigured } from '$lib/supabase';

	let { children } = $props();

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
		if ($zenMode) {
			document.documentElement.classList.add('zen');
		} else {
			document.documentElement.classList.remove('zen');
		}
	});

	onMount(async () => {
		if (typeof window === 'undefined') return;
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const { ask } = await import('@tauri-apps/plugin-dialog');

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
				const confirmed = await ask(
					translate('layout.unsaved_message', { names }),
					{ title: translate('layout.unsaved_title'), kind: 'warning', okLabel: translate('layout.discard_close'), cancelLabel: translate('common.cancel') }
				);
				if (confirmed) await appWindow.destroy();
			});
		} catch {
			// not running inside Tauri (e.g. browser dev), ignore
		}
	});
</script>

<div class="bg-gradient-radial h-screen overflow-hidden">
	<OpenTabFileWatcher />
	{@render children()}
</div>

<style>

</style>
