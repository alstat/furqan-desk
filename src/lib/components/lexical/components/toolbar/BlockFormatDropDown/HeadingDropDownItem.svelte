<script lang="ts">
	import Icon from '@iconify/svelte';
	import { icons } from '$lib/data/toolbar/toolbar';
	import DropDownItem from '../../generic/dropdown/DropDownItem.svelte';
	import { $getSelection as getSelection } from 'lexical';
	import { $createHeadingNode as createHeadingNode, type HeadingTagType } from '@lexical/rich-text';
	import { $setBlocksType as setBlocksType } from '@lexical/selection';
	import type { Writable } from 'svelte/store';
	import type { blockTypeToBlockName } from './blockTypeToBlockName.js';
	import { getContext } from 'svelte';
	import { getEditor } from '$lexical/core/composerContext.js';

	interface Props {
		headingSize: HeadingTagType;
	}

	let { headingSize }: Props = $props();

	const blockType: Writable<keyof typeof blockTypeToBlockName> = getContext('blockType');
	const editor = getEditor();

	const formatHeading = (headingSize: HeadingTagType) => {
		if ($blockType !== headingSize) {
			editor.update(() => {
				const selection = getSelection();
				setBlocksType(selection, () => createHeadingNode(headingSize));
			});
		}
	};
</script>

<DropDownItem
	class={$blockType === headingSize ? 'active dropdown-item-active' : ''}
	onclick={() => formatHeading(headingSize)}
>
	<div class="flex flex-row items-center w-36">
		<div class="pr-2"><Icon icon={icons['heading']} width="1rem" /></div>
		<div>Heading {headingSize.charAt(1)}</div>
	</div>
</DropDownItem>
