<script lang="ts">
	import Icon from '@iconify/svelte';
	import { activeBtnStyle, icons, toolBarBtnStyle } from '$lib/data/toolbar/toolbar';
	import { OUTDENT_CONTENT_COMMAND } from 'lexical';
	import { getActiveEditor, getIsEditable } from '$lexical/core/composerContext.js';
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import { IS_APPLE } from '@lexical/utils';
	import { t } from '$lib/i18n';

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
	title={$t('toolbar.outdent')}
	type="button"
	aria-label={$t('toolbar.outdent')}
>
	<Icon icon={icons['outdent']} height="1rem" />
</button>
