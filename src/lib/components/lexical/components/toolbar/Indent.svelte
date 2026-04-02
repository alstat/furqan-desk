<script lang="ts">
	import Icon from '@iconify/svelte';
	import { activeBtnStyle, icons, toolBarBtnStyle } from '$lib/data/toolbar/toolbar';
	import { INDENT_CONTENT_COMMAND } from 'lexical';
	import { getActiveEditor, getIsEditable } from '$lexical/core/composerContext.js';
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import { IS_APPLE } from '@lexical/utils';
	import { t } from '$lib/i18n';

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
	title={`${$t('toolbar.indent')} (tab)`}
	type="button"
	aria-label={$t('toolbar.indent')}
>
	<Icon icon={icons['indent']} height="1rem" />
</button>
