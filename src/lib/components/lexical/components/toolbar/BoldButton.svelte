<script lang="ts">
  import Icon from '@iconify/svelte';
  import { activeBtnStyle, icons, toolBarBtnStyle } from '$lib/data/toolbar/toolbar';
  import {FORMAT_TEXT_COMMAND} from 'lexical';
  import {getActiveEditor, getIsEditable} from '$lexical/core/composerContext.js';
  import {getContext} from 'svelte';
  import type {Writable} from 'svelte/store';
  import {IS_APPLE} from '@lexical/utils';

  const activeEditor = getActiveEditor();
  const isEditable = getIsEditable();

  const isBold: Writable<boolean> = getContext('isBold');
</script>

<button
  disabled={!$isEditable}
  onclick={() => {
    $activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
  }}
  class={'p-1 ' + toolBarBtnStyle + ($isBold ? 'active ' + activeBtnStyle : '')}
  title={IS_APPLE ? 'Bold (⌘B)' : 'Bold (Ctrl+B)'}
  type="button"
  aria-label={`Format text as bold. Shortcut: ${IS_APPLE ? '⌘B' : 'Ctrl+B'}`}>
  <Icon icon={icons['bold']}  height=1rem/>
</button>
