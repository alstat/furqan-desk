<script lang="ts">
  import Icon from '@iconify/svelte';
  import { activeBtnStyle, icons, toolBarBtnStyle } from '$lib/data/toolbar/toolbar';
  import {FORMAT_TEXT_COMMAND} from 'lexical';
  import {getContext} from 'svelte';
  import type {Writable} from 'svelte/store';
  import {getActiveEditor, getIsEditable} from '$lexical/core/composerContext.js';

  const activeEditor = getActiveEditor();
  const isEditable = getIsEditable();

  const isStrikethrough: Writable<boolean> = getContext('isStrikethrough');
</script>

<button
  disabled={!$isEditable}
  onclick={() => {
    $activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
  }}
  class={'p-1 ' + toolBarBtnStyle + ($isStrikethrough ? 'active ' + activeBtnStyle : '')}
  title="Strikethrough"
  type="button"
  aria-label="Format text with a strikethrough">
  <Icon icon={icons['strikethrough']} width=1rem />  
</button>
