<script lang="ts">
	import '../app.css';
	import 'highlight.js/styles/github.css';
	import '$lib/icons';
	import { appDarkMode } from '$lib/stores/editor.store';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { tabs } from '$lib/stores/tabs.store';

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
				const names = dirtyTabs.map(t => `• ${t.name}`).join('\n');
				const confirmed = await ask(
					`You have unsaved changes in:\n\n${names}\n\nClose anyway and discard changes?`,
					{ title: 'Unsaved Changes', kind: 'warning', okLabel: 'Discard & Close', cancelLabel: 'Cancel' }
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
