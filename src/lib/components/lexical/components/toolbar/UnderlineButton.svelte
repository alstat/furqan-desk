<script lang="ts">
  import Icon from '@iconify/svelte';
  import { activeBtnStyle, icons, toolBarBtnStyle } from '$lib/data/toolbar/toolbar';
  import {getContext} from 'svelte';
  import {FORMAT_TEXT_COMMAND} from 'lexical';
  import type {Writable} from 'svelte/store';
  import {getActiveEditor, getIsEditable} from '$lexical/core/composerContext.js';
  import {IS_APPLE} from '@lexical/utils';

  const activeEditor = getActiveEditor();
  const isEditable = getIsEditable();

  const isUnderline: Writable<boolean> = getContext('isUnderline');
</script>

<button
  disabled={!$isEditable}
  onclick={() => {
    $activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
  }}
  class={'p-1 ' + toolBarBtnStyle + ($isUnderline ? 'active ' + activeBtnStyle : '')}
  title={IS_APPLE ? 'Underline (⌘U)' : 'Underline (Ctrl+U)'}
  type="button"
  aria-label={`Format text to underlined. Shortcut: ${
    IS_APPLE ? '⌘U' : 'Ctrl+U'
  }`}>
  <Icon icon={icons['underline']} width=1rem />
</button>
