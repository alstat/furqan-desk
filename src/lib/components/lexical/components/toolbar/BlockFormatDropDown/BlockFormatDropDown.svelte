<script lang="ts">
  import {getIsEditable} from '$lexical/core/composerContext.js';
  import {getContext} from 'svelte';
  import type {Writable} from 'svelte/store';
  import DropDown from '../../generic/dropdown/DropDown.svelte';
  import {blockTypeToBlockName} from './blockTypeToBlockName.js';
  import { t } from '$lib/i18n';
  interface Props {
    children?: import('svelte').Snippet;
  }

  let {children}: Props = $props();

  const blockType: Writable<keyof typeof blockTypeToBlockName> =
    getContext('blockType');
  const isEditable = getIsEditable();
</script>

<DropDown
  disabled={!$isEditable}
  buttonClassName="w-22 "
  buttonIconClassName={'w-22 ' + $blockType}
  buttonLabel={$t('block.' + $blockType)}
  buttonAriaLabel="Formatting options for text style">
  {@render children?.()}
</DropDown>
