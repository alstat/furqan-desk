<script lang="ts">
  import {getCommands} from '$lexical/core/commands.js';
  import {getEditor} from '$lexical/core/composerContext.js';
  import ColorPicker from './ColorPicker.svelte';
  import Icon from '@iconify/svelte';
  import {tick} from 'svelte';

  const editor = getEditor();

  interface Props {
    color: string;
    title: string;
    showModal?: boolean;
  }

  let {color, title, showModal = $bindable(false)}: Props = $props();

  let onChangeCb: ((value: string, skipHistoryStack: boolean) => void) | undefined;

  export function open(callback: (value: string, skipHistoryStack: boolean) => void) {
    onChangeCb = callback;
    showModal = true;
  }

  async function close() {
    showModal = false;
    onChangeCb = undefined;
    await tick();
    getCommands().FocusEditor.execute(editor);
  }

  function onColorChange(value: string, skipHistoryStack: boolean) {
    onChangeCb?.(value, skipHistoryStack);
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {destroy() {node.remove();}};
  }
</script>

{#if showModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    use:portal
    class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-brand-charcoal-900/40 backdrop-blur-sm"
    onclick={(e) => {if (e.target === e.currentTarget) close();}}
  >
    <div class="flex w-full max-w-sm flex-col rounded-2xl bg-white dark:bg-[#303446] shadow-2xl overflow-hidden">

      <!-- Header (mirrors Bookmark dialog) -->
      <div class="shrink-0 bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-5 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gold-200 dark:bg-[#414559]">
              <Icon icon="fluent:paint-bucket-16-filled" class="text-brand-gold-600 dark:text-[#e5c890]" width="1rem" />
            </div>
            <div>
              <h2 class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]">{title}</h2>
              <p class="text-[11px] text-brand-charcoal-300 dark:text-[#8087a2]">Pick a color</p>
            </div>
          </div>
          <button
            onclick={close}
            class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
          >
            <Icon icon="solar:close-circle-bold" width="1rem" />
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="px-5 py-4 bg-brand-sand-50 dark:bg-[#232634] flex flex-col items-center gap-3">
        <ColorPicker {color} onChange={onColorChange} />
      </div>

      <!-- Footer -->
      <div class="shrink-0 bg-brand-sand-50 dark:bg-[#232634] border-t border-brand-sand-200 dark:border-[#414559] px-5 py-3 flex justify-end">
        <button
          onclick={close}
          class="h-9 px-5 cursor-pointer flex items-center justify-center gap-1.5 rounded-xl bg-brand-gold-400 text-xs font-semibold text-white hover:bg-brand-gold-600 active:bg-brand-gold-600/90 transition-colors"
        >
          <Icon icon="solar:check-circle-bold" width="0.85rem" />
          Apply
        </button>
      </div>
    </div>
  </div>
{/if}
