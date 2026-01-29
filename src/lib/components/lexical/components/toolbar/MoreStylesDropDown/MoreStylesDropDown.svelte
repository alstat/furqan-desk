<script lang="ts">
  import {getIsEditable} from '$lexical/core/composerContext.js';
  import DropDown from '$lexical/components/generic/dropdown/DropDown.svelte';
  interface Props {
    children?: import('svelte').Snippet;
  }

  let {children}: Props = $props();

  const isEditable = getIsEditable();
</script>

<DropDown
  disabled={!$isEditable}
  buttonClassName="toolbar-item spaced"
  buttonLabel=""
  buttonAriaLabel="Formatting options for additional text styles"
  buttonIconClassName="icon dropdown-more">
  {@render children?.()}
</DropDown>
