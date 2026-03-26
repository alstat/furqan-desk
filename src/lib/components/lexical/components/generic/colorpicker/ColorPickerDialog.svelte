<script lang="ts">
  import {getCommands} from '$lexical/core/commands.js';
  import {getEditor} from '$lexical/core/composerContext.js';
  import ColorPicker from './ColorPicker.svelte';
  import Icon from '@iconify/svelte';
  import {tick, onDestroy} from 'svelte';

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

  // ── Drag ─────────────────────────────────────────────────────────────────
  const PANEL_W = 272;

  let x = $state(0);
  let y = $state(0);
  let isDragging = $state(false);
  let dragStartX = 0, dragStartY = 0, startX = 0, startY = 0;
  let initialized = false;

  $effect(() => {
    if (showModal && !initialized) {
      x = Math.max(0, (window.innerWidth  - PANEL_W) / 2);
      y = Math.max(0, (window.innerHeight - 220)     / 2);
      initialized = true;
    }
    if (!showModal) initialized = false;
  });

  function startDrag(e: PointerEvent) {
    isDragging = true;
    dragStartX = e.clientX; dragStartY = e.clientY;
    startX = x; startY = y;
    window.addEventListener('pointermove', onDrag);
    window.addEventListener('pointerup', stopDrag, {once: true});
  }

  function onDrag(e: PointerEvent) {
    x = Math.max(0, Math.min(window.innerWidth  - PANEL_W, startX + (e.clientX - dragStartX)));
    y = Math.max(0, Math.min(window.innerHeight - 60,      startY + (e.clientY - dragStartY)));
  }

  function stopDrag() {
    isDragging = false;
    window.removeEventListener('pointermove', onDrag);
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', onDrag);
    }
  });
</script>

{#if showModal}
  <!-- Transparent click-away (no blur, no dim) -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div use:portal class="fixed inset-0 z-[9998]" onclick={close}></div>

  <!-- Floating panel -->
  <div
    use:portal
    class="fixed z-[9999] rounded-lg bg-white dark:bg-[#292c3c]
           border border-stone-200 dark:border-[#414559]
           shadow-xl shadow-slate-200/60 dark:shadow-black/40
           flex flex-col overflow-hidden"
    style="left:{x}px; top:{y}px; width:{PANEL_W}px;"
  >
    <!-- Drag handle header -->
    <div
      class="shrink-0 px-3 py-2 border-b border-stone-200 dark:border-[#414559]
             bg-brand-sand-50 dark:bg-[#232634]
             flex items-center justify-between gap-2 select-none
             {isDragging ? 'cursor-grabbing' : 'cursor-grab'}"
      onpointerdown={startDrag}
      role="banner"
    >
      <div class="flex items-center gap-1.5">
        <Icon icon="fluent:paint-bucket-16-filled"
              class="text-brand-charcoal-300 dark:text-[#838ba7]"
              width="0.75rem" />
        <span class="text-[10px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">
          {title}
        </span>
      </div>
      <button
        onclick={close}
        aria-label="Close"
        class="cursor-pointer text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-charcoal-500 dark:hover:text-[#c6d0f5] transition-colors"
      >
        <Icon icon="solar:close-circle-bold" width="0.85rem" />
      </button>
    </div>

    <!-- Body -->
    <div class="px-2 py-2 bg-white dark:bg-[#292c3c]">
      <ColorPicker {color} onChange={onColorChange} />
    </div>
  </div>
{/if}
