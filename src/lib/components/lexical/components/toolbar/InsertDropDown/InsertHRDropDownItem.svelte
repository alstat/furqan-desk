<script lang="ts">
	import { getActiveEditor } from '$lexical/core/composerContext.js';
	import { INSERT_HORIZONTAL_RULE_COMMAND } from '$lexical/core/plugins/HorizontalRuleNode.js';
	import Icon from '@iconify/svelte';
	import DropDownItem from '../../generic/dropdown/DropDownItem.svelte';
	import { icons } from '$lib/data/toolbar/toolbar';
	import { t } from '$lib/i18n';

	const activeEditor = getActiveEditor();
</script>

<DropDownItem
	onclick={() => {
		$activeEditor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
	}}
	class="item"
>
<div class="flex flex-row items-center w-32">
  <div class="pr-2"><Icon icon={icons['hr']} width=1rem/></div>
  <div>{$t('insert.hr')}</div>
</div>
</DropDownItem>
