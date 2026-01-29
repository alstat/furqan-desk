<script lang="ts">
  import Icon from '@iconify/svelte';
  import type {LexicalEditor} from 'lexical';
  import {exportFile} from '@lexical/file';
  import {getEditor} from '$lexical/core/composerContext.js';
	import { actionBtnStyle } from '$lib/data/toolbar/toolbar';

  const editor: LexicalEditor = getEditor();
</script>

<button
  class={actionBtnStyle + ' p-1'}
  onclick={() =>
    exportFile(editor, {
      fileName: `Playground ${new Date().toISOString()}`,
      source: 'Playground',
    })}
  title="Export"
  aria-label="Export editor state to JSON">
  <Icon icon="solar:import-bold-duotone" width=1rem/>
</button>
