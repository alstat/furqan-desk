<script lang="ts">
	import Icon from '@iconify/svelte';
	import { openFile } from '$lib/actions/fileActions';
	import { actionBtnStyle } from '$lib/data/toolbar/toolbar';
	import { t } from '$lib/i18n';
</script>

<button
	class={actionBtnStyle}
	onclick={openFile}
	title={$t('toolbar.open_file')}
	aria-label={$t('toolbar.open_file')}
>
	<Icon icon="solar:folder-open-bold-duotone" width="1rem" />
</button>
