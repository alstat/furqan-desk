<script lang="ts">
  import DropDownItem from '$lexical/components/generic/dropdown/DropDownItem.svelte';

  import {getActiveEditor} from '$lexical/core/composerContext.js';
  import {FORMAT_TEXT_COMMAND} from 'lexical';
  import {getContext} from 'svelte';
  import type {Writable} from 'svelte/store';
  import { t } from '$lib/i18n';

  const activeEditor = getActiveEditor();

  const isStrikethrough: Writable<boolean> = getContext('isStrikethrough');
</script>

<DropDownItem
  onclick={() => {
    $activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
  }}
  class={'item ' + ($isStrikethrough ? 'active dropdown-item-active' : '')}
  title={$t('toolbar.strikethrough')}
  ariaLabel={$t('toolbar.strikethrough')}>
  <i class="icon strikethrough"></i>
  <span class="text">{$t('toolbar.strikethrough')}</span>
</DropDownItem>
