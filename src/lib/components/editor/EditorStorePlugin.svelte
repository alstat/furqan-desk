<script lang="ts">
	import { getEditor } from '$lib/components/lexical/core/composerContext';
	import { lexicalEditorInstance } from '$lib/stores/editor.store';
	import { activeTabId, tabs } from '$lib/stores/tabs.store';
	import { get } from 'svelte/store';

	const editor = getEditor();

	$effect(() => {
		lexicalEditorInstance.set(editor);

		const unregisterDirty = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves, tags }) => {
			if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
			// Programmatic loads (file open / tab switch / cross-group sync) tag the
			// update so we don't mark the tab dirty for non-user changes.
			if (tags.has('history-merge')) return;
			const id = get(activeTabId);
			if (!id) return;
			// Already dirty — skip the store write so activeTab subscribers
			// (e.g. EditorComposer's scroll effects) don't churn on every keystroke.
			const current = get(tabs).find(t => t.id === id);
			if (!current || current.isDirty) return;
			tabs.update(ts => ts.map(t => t.id === id ? { ...t, isDirty: true } : t));
		});

		return () => {
			lexicalEditorInstance.set(null);
			unregisterDirty();
		};
	});
</script>
