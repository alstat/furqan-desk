<script lang="ts">
	import Icon from '@iconify/svelte';
	import { openFile } from '$lib/actions/fileActions';
	import { actionBtnStyle } from '$lib/data/toolbar/toolbar';
	import { t } from '$lib/i18n';

	// The window header renders the bar flat; every other caller keeps the pill.
	let { btnClass = actionBtnStyle }: { btnClass?: string } = $props();
</script>

<button
	class={btnClass}
	onclick={openFile}
	title={$t('toolbar.open_file')}
	aria-label={$t('toolbar.open_file')}
>
	<Icon icon="solar:folder-open-bold-duotone" width="1rem" />
</button>
