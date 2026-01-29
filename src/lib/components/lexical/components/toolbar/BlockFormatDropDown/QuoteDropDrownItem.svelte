<script lang="ts">
  import Icon from '@iconify/svelte';
  import { icons } from '$lib/data/toolbar/toolbar';
  import {getContext} from 'svelte';
  import type {Writable} from 'svelte/store';
  import {getEditor} from '$lexical/core/composerContext.js';
  import DropDownItem from '../../generic/dropdown/DropDownItem.svelte';
  import type {blockTypeToBlockName} from './blockTypeToBlockName.js';
  import {$setBlocksType as setBlocksType} from '@lexical/selection';
  import {$getSelection as getSelection} from 'lexical';
  import {$createQuoteNode as createQuoteNode} from '@lexical/rich-text';

  const blockType: Writable<keyof typeof blockTypeToBlockName> =
    getContext('blockType');
  const editor = getEditor();

  const formatQuote = () => {
    if ($blockType !== 'quote') {
      editor.update(() => {
        const selection = getSelection();
        setBlocksType(selection, () => createQuoteNode());
      });
    }
  };
</script>

<DropDownItem
  class={($blockType === 'quote' ? 'active dropdown-item-active' : '')}
  onclick={formatQuote}>
  <div class="flex flex-row items-center w-36">
    <div class="pr-2"><Icon icon={icons['quote']} width=1rem/></div>
    <div>Quote</div>
  </div>
</DropDownItem>
