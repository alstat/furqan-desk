<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import CollapsibleSidebar from '$lib/components/shared/CollapsibleSidebar.svelte';
	import RichTextEditor from '$lib/components/editor/EditorComposer.svelte';
	import TypstEditor from '$lib/components/editor/TypstEditor.svelte';
	import EditorTabs from '$lib/components/editor/EditorTabs.svelte';
	import { lexicalEditorInstance } from '$lib/stores/editor.store';
	import { tabs, activeTab, activeTabId, createTab } from '$lib/stores/tabs.store';
	import { typstSource } from '$lib/stores/editor.store';

	// Bootstrap: ensure at least one tab exists
	onMount(() => {
		if (get(tabs).length === 0) {
			const t = createTab('lexical');
			tabs.set([t]);
			activeTabId.set(t.id);
		}
	});

	// When active tab changes: sync editor state
	let prevTabId: string | null = null;
	$effect(() => {
		const tab = $activeTab;
		if (!tab || tab.id === prevTabId) return;

		// Save departing lexical tab state
		if (prevTabId) {
			const prevTab = get(tabs).find(t => t.id === prevTabId);
			if (prevTab?.type === 'lexical') {
				const editor = get(lexicalEditorInstance);
				if (editor) {
					const json = JSON.stringify(editor.getEditorState().toJSON());
					tabs.update(ts => ts.map(t => (t.id === prevTabId ? { ...t, content: json } : t)));
				}
			}
		}
		prevTabId = tab.id;

		// Restore arriving tab state
		if (tab.type === 'typst' || tab.type === 'text') {
			typstSource.set(tab.content);
		} else if (tab.type === 'lexical') {
			const editor = get(lexicalEditorInstance);
			if (editor && tab.content) {
				try {
					// Handle both raw editorState JSON and serializedDocument
					// format saved by @lexical/file: { source, version, editorState }
					const parsed = JSON.parse(tab.content);
					const stateData = parsed.editorState ?? parsed;
					editor.setEditorState(editor.parseEditorState(JSON.stringify(stateData)));
				} catch {
					/* fresh editor for empty content */
				}
			}
		}
	});
</script>

<CollapsibleSidebar>
	<div class="h-full flex flex-col overflow-visible">
		<div class="flex-1 min-h-0 overflow-visible">
			{#if $activeTab?.type === 'typst' || $activeTab?.type === 'text'}
				<TypstEditor />
			{:else}
				<RichTextEditor />
			{/if}
		</div>
		<EditorTabs />
	</div>
</CollapsibleSidebar>
