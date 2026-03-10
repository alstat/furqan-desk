<script lang="ts">
	import Icon from '@iconify/svelte';
	import { CAN_UNDO_COMMAND, UNDO_COMMAND, COMMAND_PRIORITY_CRITICAL } from 'lexical';
	import { IS_APPLE } from '@lexical/utils';
	import { undo } from '@codemirror/commands';
	import { actionBtnStyle, icons } from '$lib/data/toolbar/toolbar';
	import { lexicalEditorInstance, codeMirrorViewInstance, codeMirrorCanUndo } from '$lib/stores/editor.store';
	import { activeTab } from '$lib/stores/tabs.store';
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
		$activeTab?.type === 'lexical' ? lexicalCanUndo : $codeMirrorCanUndo
	);

	function handleUndo() {
		if ($activeTab?.type === 'lexical') {
			get(lexicalEditorInstance)?.dispatchCommand(UNDO_COMMAND, undefined);
		} else {
			const view = get(codeMirrorViewInstance);
			if (view) undo(view);
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
