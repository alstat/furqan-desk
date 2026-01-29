<script lang="ts">
  import Icon from '@iconify/svelte';
  import { icons } from '$lib/data/toolbar/toolbar';
  import {INSERT_CHECK_LIST_COMMAND} from '@lexical/list';
  import {getContext} from 'svelte';
  import type {Writable} from 'svelte/store';
  import {getEditor} from '$lexical/core/composerContext.js';
  import DropDownItem from '../../generic/dropdown/DropDownItem.svelte';
  import type {blockTypeToBlockName} from './blockTypeToBlockName.js';
  import {formatParagraph} from './formatParagraph.js';

  const blockType: Writable<keyof typeof blockTypeToBlockName> =
    getContext('blockType');
  const editor = getEditor();

  const formatCheckList = () => {
    if ($blockType !== 'check') {
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
    } else {
      formatParagraph(editor);
    }
  };
</script>

<DropDownItem
  class={($blockType === 'check' ? 'active dropdown-item-active' : '')}
  onclick={formatCheckList}>
  <div class="flex flex-row items-center w-36">
    <div class="pr-2"><Icon icon={icons['checklist']} width=1rem/></div>
    <div>Check List</div>
  </div>
</DropDownItem>
