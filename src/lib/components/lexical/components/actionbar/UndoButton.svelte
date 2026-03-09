<script lang="ts">
	import Icon from '@iconify/svelte';
	import { CAN_UNDO_COMMAND, UNDO_COMMAND, COMMAND_PRIORITY_CRITICAL } from 'lexical';
	import { IS_APPLE } from '@lexical/utils';
	import { actionBtnStyle, icons } from '$lib/data/toolbar/toolbar';
	import { lexicalEditorInstance } from '$lib/stores/editor.store';
	import { activeTab, activeTabId, undoHistory, undoActiveTab } from '$lib/stores/tabs.store';
	import { get } from 'svelte/store';

	let lexicalCanUndo = $state(false);
	let unregister: (() => boolean) | null = null;

	$effect(() => {
		unregister?.();
		unregister = null;
		const editor = $lexicalEditorInstance;
		if (editor) {
			unregister = editor.registerCommand(
				CAN_UNDO_COMMAND,
				(payload) => { lexicalCanUndo = payload; return false; },
				COMMAND_PRIORITY_CRITICAL
			);
		} else {
			lexicalCanUndo = false;
		}
	});

	const canUndo = $derived(
		$activeTab?.type === 'lexical'
			? lexicalCanUndo
			: (undoHistory.get($activeTabId ?? '') ?? []).length > 0
	);

	function handleUndo() {
		if ($activeTab?.type === 'lexical') {
			get(lexicalEditorInstance)?.dispatchCommand(UNDO_COMMAND, undefined);
		} else {
			undoActiveTab();
		}
	}
</script>

<button
	disabled={!canUndo}
	onclick={handleUndo}
	title={IS_APPLE ? 'Undo (⌘Z)' : 'Undo (Ctrl+Z)'}
	type="button"
	class={actionBtnStyle + ' p-1'}
	aria-label="Undo"
>
	{#if !canUndo}
		<span class="text-slate-300"><Icon icon={icons['undo']} width="1rem" /></span>
	{:else}
		<Icon icon={icons['undo']} width="1rem" />
	{/if}
</button>
