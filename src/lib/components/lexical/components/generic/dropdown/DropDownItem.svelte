<script lang="ts">
  import {onMount} from 'svelte';
  import {getRegisterItemFunc} from './utils.js';

  interface Props {
    class: string;
    title?: string | undefined;
    ariaLabel?: string | undefined;
    onclick?: () => void;
    children?: import('svelte').Snippet;
  }

  let {
    class: className,
    title = undefined,
    ariaLabel = undefined,
    onclick,
    children,
  }: Props = $props();

  let ref: HTMLButtonElement | undefined = $state();

  const registerItem = getRegisterItemFunc();

  if (registerItem === null) {
    throw new Error('DropDownItem must be used within a DropDown');
  }

  onMount(() => {
    registerItem(ref!);
  });
</script>

<button
  class={'cursor-pointer flex flex-row justify-start p-1 m-1 text-sm rounded-lg hover:bg-slate-300 hover:text-slate-700 active:bg-slate-200 ' + className}
  {onclick}
  bind:this={ref}
  {title}
  type="button"
  aria-label={ariaLabel}>
  {@render children?.()}
</button>
