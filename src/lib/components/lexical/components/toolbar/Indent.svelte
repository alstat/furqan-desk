<script lang="ts">
	import Icon from '@iconify/svelte';
	import { activeBtnStyle, icons, toolBarBtnStyle } from '$lib/data/toolbar/toolbar';
	import { INDENT_CONTENT_COMMAND } from 'lexical';
	import { getActiveEditor, getIsEditable } from '$lexical/core/composerContext.js';
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import { IS_APPLE } from '@lexical/utils';

	const activeEditor = getActiveEditor();
	const isEditable = getIsEditable();

	const isIndent: Writable<boolean> = getContext('isIndent');
</script>

<button
	disabled={!$isEditable}
	onclick={() => {
		$activeEditor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
	}}
	class={'p-1 ' + toolBarBtnStyle + ($isIndent ? 'active ' + activeBtnStyle : '')}
	title={IS_APPLE ? 'Indent (tab)' : 'Indent (tab)'}
	type="button"
	aria-label={`Adds tab space to the paragraph. Shortcut: ${IS_APPLE ? 'tab' : 'tab'}`}
>
	<Icon icon={icons['indent']} height="1rem" />
</button>
