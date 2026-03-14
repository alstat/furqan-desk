<script lang="ts">
	import Icon from '@iconify/svelte';
	import { open as openDialog } from '@tauri-apps/plugin-dialog';
	import { readTextFile } from '@tauri-apps/plugin-fs';
	import { openOrFocusTab } from '$lib/stores/tabs.store';
	import { actionBtnStyle } from '$lib/data/toolbar/toolbar';

	async function openFile() {
		const result = await openDialog({
			multiple: false,
			filters: [
				{ name: 'All Supported Files', extensions: ['typ', 'bib', 'txt', 'md', 'lexical', 'json', 'jl'] }
			]
		});
		if (!result || Array.isArray(result)) return;
		const content = await readTextFile(result as string);
		openOrFocusTab(result as string, content);
	}
</script>

<button
	class={actionBtnStyle}
	onclick={openFile}
	title="Open file"
	aria-label="Open file"
>
	<Icon icon="solar:folder-open-bold-duotone" width="1rem" />
</button>
