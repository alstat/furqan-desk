<script lang="ts">
	import Icon from '@iconify/svelte';
	import { activeBtnStyle, icons, toolBarBtnStyle } from '$lib/data/toolbar/toolbar';
	import { OUTDENT_CONTENT_COMMAND } from 'lexical';
	import { getActiveEditor, getIsEditable } from '$lexical/core/composerContext.js';
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import { IS_APPLE } from '@lexical/utils';

	const activeEditor = getActiveEditor();
	const isEditable = getIsEditable();

	const isOutdent: Writable<boolean> = getContext('isOutdent');
</script>

<button
	disabled={!$isEditable}
	onclick={() => {
		$activeEditor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
	}}
	class={'p-1 ' + toolBarBtnStyle + ($isOutdent ? 'active ' + activeBtnStyle : '')}
	title={IS_APPLE ? 'Outdent' : 'Outdent'}
	type="button"
	aria-label={`Removes tab space to the paragraph. Shortcut: ${IS_APPLE ? 'tab' : 'tab'}`}
>
	<Icon icon={icons['outdent']} height="1rem" />
</button>
