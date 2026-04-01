<script lang="ts">
  import {FORMAT_TEXT_COMMAND} from 'lexical';
  import Icon from '@iconify/svelte';
  import { activeBtnStyle, icons, toolBarBtnStyle } from '$lib/data/toolbar/toolbar';
  import {getActiveEditor, getIsEditable} from '$lexical/core/composerContext.js';
  import {getContext} from 'svelte';
  import type {Writable} from 'svelte/store';
  import {IS_APPLE} from '@lexical/utils';
  import { t } from '$lib/i18n';

  const activeEditor = getActiveEditor();
  const isEditable = getIsEditable();

  const isItalic: Writable<boolean> = getContext('isItalic');
</script>

<button
  disabled={!$isEditable}
  onclick={() => {
    $activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
  }}
  class={'p-1 ' + toolBarBtnStyle + ($isItalic ? 'active ' + activeBtnStyle : '')}
  title={IS_APPLE ? `${$t('toolbar.italic')} (⌘I)` : `${$t('toolbar.italic')} (Ctrl+I)`}
  type="button"
  aria-label={`${$t('toolbar.italic')}. Shortcut: ${IS_APPLE ? '⌘I' : 'Ctrl+I'}`}>
  <Icon icon={icons['italic']} width=1rem />
</button>
