<script lang="ts">
  import DropDownItem from '$lexical/components/generic/dropdown/DropDownItem.svelte';
  import {getActiveEditor} from '$lexical/core/composerContext.js';
  import {FORMAT_TEXT_COMMAND} from 'lexical';
  import {getContext} from 'svelte';
  import type {Writable} from 'svelte/store';
  import { t } from '$lib/i18n';

  const activeEditor = getActiveEditor();

  const isSubscript: Writable<boolean> = getContext('isSubscript');
</script>

<DropDownItem
  onclick={() => {
    $activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript');
  }}
  class={'item ' + ($isSubscript ? 'active dropdown-item-active' : '')}
  title={$t('toolbar.subscript')}
  ariaLabel={$t('toolbar.subscript')}>
  <i class="icon subscript"></i>
  <span class="text">{$t('toolbar.subscript')}</span>
</DropDownItem>
