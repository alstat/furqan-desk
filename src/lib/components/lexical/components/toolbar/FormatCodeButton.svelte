<script lang="ts">
	import { FORMAT_TEXT_COMMAND } from 'lexical';
	import { getContext } from 'svelte';
    import Icon from '@iconify/svelte';
    import { activeBtnStyle, icons, toolBarBtnStyle } from '$lib/data/toolbar/toolbar';
	import type { Writable } from 'svelte/store';
	import { getActiveEditor, getIsEditable } from '$lexical/core/composerContext.js';

	const isEditable = getIsEditable();
	const activeEditor = getActiveEditor();
	const isCode: Writable<boolean> = getContext('isCode');
</script>

<button
	disabled={!$isEditable}
	onclick={() => {
		$activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
	}}
    class={'p-1 ' + toolBarBtnStyle + ($isCode ? 'active ' + activeBtnStyle : '')}
	title="Insert code block"
	type="button"
	aria-label="Insert code block"
>
    <Icon icon={icons['code']} width=1rem />
</button>
