<script lang="ts">
  import Icon from '@iconify/svelte';
  import type {LexicalEditor} from 'lexical';
  import {importFile} from '@lexical/file';
  import {getEditor} from '$lexical/core/composerContext.js';
	import { actionBtnStyle } from '$lib/data/toolbar/toolbar';

  const editor: LexicalEditor = getEditor();
</script>

<button
  class={actionBtnStyle}
  onclick={() => importFile(editor)}
  title="Import"
  aria-label="Import editor state from JSON">
  <Icon icon="solar:folder-open-bold-duotone" width=1rem/>
</button>
