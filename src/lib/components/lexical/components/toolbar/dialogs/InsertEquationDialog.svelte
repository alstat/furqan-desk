<script lang="ts">
    import {getCommands} from '$lexical/core/commands.js';
    import {getEditor} from '$lexical/core/composerContext.js';
    import {tick} from 'svelte';
    import CloseCircleButton from '../../generic/button/CloseCircleButton.svelte';
    import ModalDialog from '../../generic/dialog/ModalDialog.svelte';
	import InsertEquationDialogBody from './InsertEquationDialogBody.svelte';
  
    const editor = getEditor();
  
    interface Props {
      showModal?: boolean;
    }
  
    let {showModal = $bindable(false)}: Props = $props();
    export function open() {
      showModal = true;
    }
  
    async function close() {
      showModal = false;
      await tick();
      getCommands().FocusEditor.execute(editor);
    }
  </script>
  
  <ModalDialog bind:showModal>
    <CloseCircleButton on:click={close} />
  
    <InsertEquationDialogBody on:confirm={close} />
  </ModalDialog>
  