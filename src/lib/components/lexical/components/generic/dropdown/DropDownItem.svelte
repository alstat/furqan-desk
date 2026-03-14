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
  class={'cursor-pointer flex flex-row justify-start p-1 m-1 text-sm rounded-lg text-brand-charcoal-500 hover:bg-brand-sand-200 hover:text-brand-charcoal-900 active:bg-brand-sand-400 ' + className}
  {onclick}
  bind:this={ref}
  {title}
  type="button"
  aria-label={ariaLabel}>
  {@render children?.()}
</button>
