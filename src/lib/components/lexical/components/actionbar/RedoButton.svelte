<script lang="ts">
	import Icon from '@iconify/svelte';
	import { actionBtnStyle, icons, toolBarBtnStyle } from '$lib/data/toolbar/toolbar';
	import { CAN_REDO_COMMAND, REDO_COMMAND, COMMAND_PRIORITY_CRITICAL } from 'lexical';
	import { onMount } from 'svelte';
	import { getEditor, getIsEditable, getActiveEditor } from '$lexical/core/composerContext.js';
	import { IS_APPLE } from '@lexical/utils';

	const editor = getEditor();
	const activeEditor = getActiveEditor();
	const isEditable = getIsEditable();

	let canRedo = $state(false);

	// unregisters onDestroy through returned callback
	onMount(() => {
		return editor.registerCommand(
			CAN_REDO_COMMAND,
			(payload) => {
				canRedo = payload;
				return false;
			},
			COMMAND_PRIORITY_CRITICAL
		);
	});
</script>

<button
	disabled={!canRedo || !$isEditable}
	onclick={() => {
        console.log('here is the activeEditor')
        console.log(activeEditor)
		$activeEditor.dispatchCommand(REDO_COMMAND, undefined);
	}}
	title={IS_APPLE ? 'Redo (⌘Y)' : 'Redo (Ctrl+Y)'}
	type="button"
	class={actionBtnStyle + ' p-1'}
	aria-label="Redo"
>
	{#if !canRedo || !$isEditable}
		<span class="text-slate-300"><Icon icon={icons['redo']} width="1rem" /></span>
	{:else}
		<Icon icon={icons['redo']} width="1rem" />
	{/if}
</button>
