<script lang="ts">
	import Icon from '@iconify/svelte';
	import { actionBtnStyle } from '$lib/data/toolbar/toolbar';
	import { save as saveDialog } from '@tauri-apps/plugin-dialog';
	import { writeTextFile } from '@tauri-apps/plugin-fs';
	import { serializedDocumentFromEditorState } from '@lexical/file';
	import { IS_APPLE } from '@lexical/utils';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { lexicalEditorInstance } from '$lib/stores/editor.store';
	import { activeTab, activeTabId, markTabSaved } from '$lib/stores/tabs.store';

	async function saveFile() {
		const tab = get(activeTab);
		if (!tab) return;

		if (tab.type === 'lexical') {
			const editor = get(lexicalEditorInstance);
			if (!editor) return;
			const doc = serializedDocumentFromEditorState(editor.getEditorState(), {
				source: 'Furqan Desk'
			});
			const json = JSON.stringify(doc, null, 2);
			let path = tab.path;
			if (!path) {
				path = await saveDialog({
					title: 'Save Lexical File',
					defaultPath: `${tab.name}.lexical`,
					filters: [{ name: 'Lexical File', extensions: ['lexical', 'json'] }]
				});
				if (!path) return;
			}
			await writeTextFile(path, json);
			markTabSaved(get(activeTabId)!, path);
		} else if (tab.type === 'julia') {
			let path = tab.path;
			if (!path) {
				path = await saveDialog({
					defaultPath: `${tab.name}.jl`,
					filters: [{ name: 'Julia', extensions: ['jl'] }]
				});
				if (!path) return;
			}
			await writeTextFile(path, tab.content);
			markTabSaved(get(activeTabId)!, path);
		} else {
			// typst / text / bib — save raw content
			let path = tab.path;
			if (!path) {
				const ext = tab.type === 'typst' ? 'typ' : 'txt';
				path = await saveDialog({
					defaultPath: `${tab.name}.${ext}`,
					filters: [{ name: 'Text Files', extensions: ['typ', 'bib', 'txt', 'md'] }]
				});
				if (!path) return;
			}
			await writeTextFile(path, tab.content);
			markTabSaved(get(activeTabId)!, path);
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if ((IS_APPLE ? e.metaKey : e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			saveFile();
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	});
</script>

<button
	class={actionBtnStyle + ' p-1'}
	onclick={saveFile}
	title={IS_APPLE ? 'Save (⌘S)' : 'Save (Ctrl+S)'}
	aria-label="Save file"
>
	<Icon icon="solar:diskette-bold-duotone" width="1rem" />
</button>
