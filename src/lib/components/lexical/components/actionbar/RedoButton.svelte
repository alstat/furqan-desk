<script lang="ts">
	import Icon from '@iconify/svelte';
	import { CAN_REDO_COMMAND, REDO_COMMAND, COMMAND_PRIORITY_CRITICAL } from 'lexical';
	import { IS_APPLE } from '@lexical/utils';
	import { actionBtnStyle, icons } from '$lib/data/toolbar/toolbar';
	import { lexicalEditorInstance } from '$lib/stores/editor.store';
	import { activeTab, activeTabId, redoHistory, redoActiveTab } from '$lib/stores/tabs.store';
	import { get } from 'svelte/store';

	let lexicalCanRedo = $state(false);
	let unregister: (() => boolean) | null = null;

	$effect(() => {
		unregister?.();
		unregister = null;
		const editor = $lexicalEditorInstance;
		if (editor) {
			unregister = editor.registerCommand(
				CAN_REDO_COMMAND,
				(payload) => { lexicalCanRedo = payload; return false; },
				COMMAND_PRIORITY_CRITICAL
			);
		} else {
			lexicalCanRedo = false;
		}
	});

	const canRedo = $derived(
		$activeTab?.type === 'lexical'
			? lexicalCanRedo
			: (redoHistory.get($activeTabId ?? '') ?? []).length > 0
	);

	function handleRedo() {
		if ($activeTab?.type === 'lexical') {
			get(lexicalEditorInstance)?.dispatchCommand(REDO_COMMAND, undefined);
		} else {
			redoActiveTab();
		}
	}
</script>

<button
	disabled={!canRedo}
	onclick={handleRedo}
	title={IS_APPLE ? 'Redo (⌘⇧Z)' : 'Redo (Ctrl+Y)'}
	type="button"
	class={actionBtnStyle + ' p-1'}
	aria-label="Redo"
>
	{#if !canRedo}
		<span class="text-slate-300"><Icon icon={icons['redo']} width="1rem" /></span>
	{:else}
		<Icon icon={icons['redo']} width="1rem" />
	{/if}
</button>
