<script lang="ts">
  import Icon from '@iconify/svelte';
  import type {LexicalEditor} from 'lexical';
  import {getEditor, getIsEditable} from '$lexical/core/composerContext.js';
	import { actionBtnStyle } from '$lib/data/toolbar/toolbar';

  const editor: LexicalEditor = getEditor();
  const isEditable = getIsEditable();
</script>

<button
  class={`${actionBtnStyle} ${$isEditable ? 'unlock ' : 'lock text-slate-50 bg-slate-500 '}`}
  onclick={() => {
    editor.setEditable(!editor.isEditable());
  }}
  title="Read-Only Mode"
  aria-label={`${!$isEditable ? 'Unlock' : 'Lock'} read-only mode`}>
  <Icon icon="solar:file-text-bold-duotone" width=1rem/>
</button>
