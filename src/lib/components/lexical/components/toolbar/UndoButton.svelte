<script lang="ts">
	import Icon from '@iconify/svelte';
  import { icons, toolBarBtnStyle } from '$lib/data/toolbar/toolbar';
	import { CAN_UNDO_COMMAND, UNDO_COMMAND, COMMAND_PRIORITY_CRITICAL } from 'lexical';
	import { onMount } from 'svelte';
	import { getEditor, getIsEditable, getActiveEditor } from '$lexical/core/composerContext.js';
	import { IS_APPLE } from '@lexical/utils';

	const editor = getEditor();
	const activeEditor = getActiveEditor();
	const isEditable = getIsEditable();

	let canUndo = $state(false);
	let disabledClass = $derived(!canUndo || !$isEditable ? 'opacity-30 cursor-not-allowed pointer-events-none' : '');

	// unregisters onDestroy through returned callback
	onMount(() => {
		return editor.registerCommand(
			CAN_UNDO_COMMAND,
			(payload) => {
				canUndo = payload;
				return false;
			},
			COMMAND_PRIORITY_CRITICAL
		);
	});
</script>

<button
	disabled={!canUndo || !$isEditable}
	onclick={() => {
		$activeEditor.dispatchCommand(UNDO_COMMAND, undefined);
	}}
	title={IS_APPLE ? 'Undo (⌘Z)' : 'Undo (Ctrl+Z)'}
	type="button"
	class={toolBarBtnStyle + ' p-1 ' + disabledClass}
	aria-label="Undo"
>
  {#if !canUndo || !$isEditable}
    <span class="text-brand-charcoal-100 dark:text-[#626880]"><Icon icon={icons['undo']} width=1rem/></span>
  {:else}
	  <Icon icon={icons['undo']} width=1rem/>
  {/if}
</button>
