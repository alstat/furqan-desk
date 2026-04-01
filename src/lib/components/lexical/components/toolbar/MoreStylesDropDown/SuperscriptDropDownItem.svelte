<script lang="ts">
  import DropDownItem from '$lexical/components/generic/dropdown/DropDownItem.svelte';
  import {getActiveEditor} from '$lexical/core/composerContext.js';
  import {FORMAT_TEXT_COMMAND} from 'lexical';
  import {getContext} from 'svelte';
  import type {Writable} from 'svelte/store';
  import { t } from '$lib/i18n';

  const activeEditor = getActiveEditor();

  const isSuperscript: Writable<boolean> = getContext('isSuperscript');
</script>

<DropDownItem
  onclick={() => {
    $activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript');
  }}
  class={'item ' + ($isSuperscript ? 'active dropdown-item-active' : '')}
  title={$t('toolbar.superscript')}
  ariaLabel={$t('toolbar.superscript')}>
  <i class="icon subscript"></i>
  <span class="text">{$t('toolbar.superscript')}</span>
</DropDownItem>
