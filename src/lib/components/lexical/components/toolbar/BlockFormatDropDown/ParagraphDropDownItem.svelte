<script lang="ts">
  import Icon from '@iconify/svelte';
  import { icons } from '$lib/data/toolbar/toolbar';
  import {getContext} from 'svelte';
  import type {Writable} from 'svelte/store';
  import DropDownItem from '../../generic/dropdown/DropDownItem.svelte';
  import type {blockTypeToBlockName} from './blockTypeToBlockName.js';
  import {
    $getSelection as getSelection,
    $createParagraphNode as createParagraphNode,
  } from 'lexical';
  import {$setBlocksType as setBlocksType} from '@lexical/selection';
  import {getEditor} from '$lexical/core/composerContext.js';

  const blockType: Writable<keyof typeof blockTypeToBlockName> =
    getContext('blockType');
  const editor = getEditor();

  const formatParagraph = () => {
    if ($blockType !== 'paragraph') {
      editor.update(() => {
        const selection = getSelection();
        setBlocksType(selection, () => createParagraphNode());
      });
    }
  };
</script>

<DropDownItem
  class={($blockType === 'paragraph' ? 'active dropdown-item-active' : '')}
  onclick={formatParagraph}>
  <div class="flex flex-row items-center w-36">
    <div class="pr-2"><Icon icon={icons['paragraph']} width=1rem/></div>
    <div>Normal</div>
  </div>
  <!-- <span class="text">Normal</span> -->
</DropDownItem>
