<svelte:options runes={true} />

<script lang="ts">
	import DropDownItem from '../../generic/dropdown/DropDownItem.svelte';
	import Icon from '@iconify/svelte';
	import { icons } from '$lib/data/toolbar/toolbar';
	import { t } from '$lib/i18n';
	let { onclick } = $props();
</script>

<DropDownItem {onclick} class="item">
	<div class="flex flex-row items-center w-32">
		<div class="pr-2"><Icon icon={icons['image']} width="1rem" /></div>
		<div>{$t('insert.image')}</div>
	</div>
</DropDownItem>
