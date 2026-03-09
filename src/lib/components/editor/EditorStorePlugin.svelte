<script lang="ts">
	import { getEditor } from '$lib/components/lexical/core/composerContext';
	import { lexicalEditorInstance } from '$lib/stores/editor.store';
	import { activeTabId, tabs } from '$lib/stores/tabs.store';
	import { get } from 'svelte/store';

	const editor = getEditor();

	$effect(() => {
		lexicalEditorInstance.set(editor);

		const unregisterDirty = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
			if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
			const id = get(activeTabId);
			if (!id) return;
			tabs.update(ts => ts.map(t => t.id === id ? { ...t, isDirty: true } : t));
		});

		return () => {
			lexicalEditorInstance.set(null);
			unregisterDirty();
		};
	});
</script>
