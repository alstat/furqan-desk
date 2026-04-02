<script lang="ts">
	import '../app.css';
	import '$lib/icons';
	import { appDarkMode } from '$lib/stores/editor.store';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { tabs } from '$lib/stores/tabs.store';
	import { t as i18n } from '$lib/i18n';

	let { children } = $props();

	$effect(() => {
		if ($appDarkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	});

	onMount(async () => {
		if (typeof window === 'undefined') return;
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const { ask } = await import('@tauri-apps/plugin-dialog');
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
	{@render children()}
</div>

<style>

</style>
